import { bus } from '../../../core/bus/connectorBus';
import { useRobotStateStore } from '../../../stores/robotStateStore';
import { log } from '../../../utils/logger';
import { onSessionEnd } from '../../controls/controlSession';
import { setExternalController, shutdown as shutdownKinematic } from '../../controls/movementEngine';
import { resolveEnvironment } from '../../environment/store/environmentStore';
import { FIXED_STEP, MAX_FRAME_SECONDS, MAX_TICKS_PER_FRAME } from '../physicsConfig';
import type { DebugSnapshot, PhysicsController } from '../integration/physicsController';
import { attachSource as attachSensors, detachSource as detachSensors, flush as flushSensors, tick as tickSensors } from '../../sensors/core/sensorManager';
import { createPhysicsSensorSource } from '../../sensors/sources/physicsSource';
import { EMPTY_INFO, useSimulationStore, type SimulationEngine, type SimulationRunState } from './simulationStore';

/**
 * Simulation manager (Phase 5): the single owner of the physics lifecycle.
 *
 * - Engine choice: Kinematic (Phase 3 movement engine) or Physics (Rapier). Only
 *   one controls the robot: while physics runs, the physics controller is
 *   registered with the movement engine and the kinematic loop never steps.
 * - Lifecycle: start (build world from the design) → running ⇄ paused → stop
 *   (dispose world, robot back to its design pose). Reset goes through C2.
 * - One loop: a fixed 60 Hz tick (4 solver substeps) driven by an animation-frame
 *   accumulator, capped per frame. Runtime state is published once per frame,
 *   telemetry four times per second: no React update per engine step.
 * - Leaving Control Mode / Code Studio or closing the project stops the simulation.
 *
 * Rapier and the controller are loaded lazily on first start.
 */

interface Scheduler {
  request: (cb: (now: number) => void) => number;
  cancel: (id: number) => void;
}

const browserScheduler: Scheduler | null =
  typeof requestAnimationFrame === 'function' ? { request: (cb) => requestAnimationFrame(cb), cancel: (id) => cancelAnimationFrame(id) } : null;

let scheduler: Scheduler | null = browserScheduler;
let controller: PhysicsController | null = null;
let frameId: number | null = null;
let lastFrame = -1;
let accumulator = 0;
let startToken = 0;
let stepTimeTotal = 0;
let stepCount = 0;
let lastInfoUpdate = 0;

const store = () => useSimulationStore.getState();

function setState(next: Partial<{ engine: SimulationEngine; state: SimulationRunState; error: string | null }>, reason?: string): void {
  const before = store();
  const previousEngine = before.engine;
  const previousState = before.state;
  store().set(next);
  const after = store();
  if (after.engine !== previousEngine || after.state !== previousState) {
    bus.publish('simulation.changed', { engine: after.engine, state: after.state, previousEngine, previousState, ...(reason ? { reason } : {}) });
  }
}

// ── Loop ──
function stopLoop(): void {
  if (frameId !== null && scheduler) scheduler.cancel(frameId);
  frameId = null;
}

function startLoop(): void {
  if (frameId !== null || !scheduler) return;
  lastFrame = -1;
  accumulator = 0;
  const frame = (now: number) => {
    frameId = null;
    if (store().state !== 'running' || !controller) return;
    if (lastFrame < 0) lastFrame = now;
    accumulator += Math.min((now - lastFrame) / 1000, MAX_FRAME_SECONDS);
    lastFrame = now;
    advance();
    if (scheduler && store().state === 'running') frameId = scheduler.request(frame);
  };
  frameId = scheduler.request(frame);
}

/** Run the fixed ticks owed by the accumulator (at most MAX_TICKS_PER_FRAME), then publish once. */
function advance(): void {
  if (!controller) return;
  let ticks = 0;
  while (accumulator >= FIXED_STEP && ticks < MAX_TICKS_PER_FRAME) {
    const t0 = performance.now();
    controller.tick(FIXED_STEP);
    // Phase 6: sensors are sampled from this same tick (no second loop).
    tickSensors(FIXED_STEP);
    stepTimeTotal += performance.now() - t0;
    stepCount += 1;
    accumulator -= FIXED_STEP;
    ticks += 1;
  }
  // Drop time the simulation cannot catch up on (a frame-time spike), instead of spiralling.
  if (accumulator > FIXED_STEP * MAX_TICKS_PER_FRAME) accumulator = 0;
  controller.publish();
  flushSensors();
  updateInfo(false);
}

function updateInfo(force: boolean): void {
  const now = performance.now();
  if (!force && now - lastInfoUpdate < 250) return;
  lastInfoUpdate = now;
  const world = controller?.physicsWorld;
  const assembly = controller?.robotAssembly;
  if (!world || !assembly) return;
  let awake = 0;
  for (const link of world.links) if (!link.body.isSleeping()) awake += 1;
  store().set({
    info: {
      bodies: world.links.length,
      joints: world.joints.length,
      colliders: assembly.links.reduce((n, l) => n + l.colliders.length, 0),
      totalMass: assembly.totalMass,
      simTime: controller!.time,
      stepMs: stepCount > 0 ? stepTimeTotal / stepCount : 0,
      awake,
      issues: assembly.issues,
    },
  });
  stepTimeTotal = 0;
  stepCount = 0;
}

// ── Public API ──

/** Start the physics simulation (Physics engine). Builds the world from the saved design. */
export async function startSimulation(): Promise<boolean> {
  const s = store();
  if (s.engine !== 'physics') return false;
  if (s.state === 'running' || s.state === 'paused') return true;
  if (s.state === 'starting') return false;
  const token = ++startToken;
  setState({ state: 'starting', error: null });
  try {
    const [{ loadRapier }, { PhysicsController: Controller }] = await Promise.all([import('../engine/rapierLoader'), import('../integration/physicsController')]);
    const rapier = await loadRapier();
    // Cancelled while loading (engine switched, stopped, mode left)?
    if (token !== startToken || store().engine !== 'physics' || store().state !== 'starting') return false;
    shutdownKinematic();
    useRobotStateStore.getState().resetRuntime();
    // Phase 7: the SAVED definition of the selected environment (template or user environment) is built.
    const next = new Controller(rapier, () => ({ gravityEnabled: store().settings.gravityEnabled, environment: resolveEnvironment(store().settings.environment) }));
    const assembly = next.build();
    if (assembly.links.length === 0) {
      next.dispose();
      setState({ state: 'stopped', error: 'This robot has no parts to simulate.' });
      return false;
    }
    controller = next;
    setExternalController(next);
    setState({ state: 'running' });
    attachSensors(createPhysicsSensorSource(next, () => store().settings.gravityEnabled));
    updateInfo(true);
    controller.publish();
    startLoop();
    log.info(
      'simulation',
      `Physics simulation started (Rapier): ${assembly.links.length} bodies, ${assembly.joints.length} joints, ${assembly.totalMass.toFixed(2)} kg, gravity ${store().settings.gravityEnabled ? 'on' : 'off'}.`,
    );
    for (const issue of assembly.issues) log.warning('simulation', issue);
    return true;
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error);
    setState({ state: 'stopped', error: `The physics engine could not start: ${message}` });
    log.error('simulation', `The physics engine could not start: ${message}`);
    return false;
  }
}

export function pauseSimulation(): boolean {
  if (store().state !== 'running') return false;
  stopLoop();
  setState({ state: 'paused' });
  log.info('simulation', 'Physics simulation paused. Time is frozen.');
  return true;
}

export function resumeSimulation(): boolean {
  if (store().state !== 'paused' || !controller) return false;
  setState({ state: 'running' });
  startLoop();
  log.info('simulation', 'Physics simulation resumed.');
  return true;
}

/** Stop the simulation: end pending commands, free the world, robot back to its design pose. */
export function stopSimulation(reason = 'Physics simulation stopped. The robot is back in its design pose.'): void {
  startToken += 1;
  const was = store().state;
  stopLoop();
  detachSensors('The physics simulation stopped.');
  if (controller) {
    controller.stopAll('stopped');
    setExternalController(null);
    controller.dispose();
    controller = null;
  }
  useRobotStateStore.getState().resetRuntime();
  store().set({ info: EMPTY_INFO });
  if (was !== 'stopped') {
    setState({ state: 'stopped' }, reason);
    log.info('simulation', reason);
  }
}

/** Choose the engine. Physics starts the simulation at once; Kinematic stops it. */
export async function selectEngine(engine: SimulationEngine): Promise<boolean> {
  if (store().engine === engine) return engine === 'physics' ? startSimulation() : true;
  if (engine === 'kinematic') {
    stopSimulation('Switched to the kinematic engine. The robot is back in its design pose.');
    setState({ engine: 'kinematic', error: null });
    log.info('simulation', 'Engine: Kinematic (Phase 3 movement).');
    return true;
  }
  shutdownKinematic();
  useRobotStateStore.getState().resetRuntime();
  setState({ engine: 'physics', error: null });
  log.info('simulation', 'Engine: Physics (Rapier).');
  return startSimulation();
}

export function setGravityEnabled(enabled: boolean): void {
  store().set({ settings: { ...store().settings, gravityEnabled: enabled } });
  controller?.physicsWorld?.setGravityEnabled(enabled);
  log.info('simulation', `Gravity ${enabled ? 'on (9.81 m/s²)' : 'off'}.`);
}

/** Change the environment. A running simulation is rebuilt (like Reset). */
export function setEnvironment(environment: string): void {
  const changed = store().settings.environment !== environment;
  store().set({ settings: { ...store().settings, environment } });
  if (changed) bus.publish('simulation.environmentChanged', { environmentId: environment });
  if (controller) {
    controller.stopAll('stopped');
    controller.build();
    useRobotStateStore.getState().resetRuntime();
    controller.publish();
    updateInfo(true);
  }
}

export function setDebugView(debug: boolean): void {
  store().set({ settings: { ...store().settings, debug } });
}

/** Latest debug data (null when no simulation runs). Read by the viewport each frame. */
export function getDebugSnapshot(): DebugSnapshot | null {
  return controller && store().settings.debug ? controller.debugSnapshot() : null;
}

// ── Tests ──

/** Tests: replace the frame scheduler (null = no automatic loop; call stepSimulation()). */
export function setSimulationScheduler(next: Scheduler | null): void {
  stopLoop();
  scheduler = next;
}

/** Tests: advance a running simulation by `seconds` of simulated time. */
export function stepSimulation(seconds: number): void {
  if (store().state !== 'running' || !controller) return;
  const ticks = Math.round(seconds / FIXED_STEP);
  for (let i = 0; i < ticks; i++) {
    controller.tick(FIXED_STEP);
    tickSensors(FIXED_STEP);
  }
  controller.publish();
  flushSensors(true);
  updateInfo(true);
}

export function isSimulationLoopRunning(): boolean {
  return frameId !== null;
}

/** Tests and diagnostics: the active physics controller, if any. */
export function activePhysicsController(): PhysicsController | null {
  return controller;
}

let connected = false;

/** Stop the simulation when the live robot session ends. Safe to call more than once. */
export function connectSimulationManager(): void {
  if (connected) return;
  connected = true;
  onSessionEnd((reason) => {
    if (store().state === 'stopped') return;
    stopSimulation(
      reason === 'mode-change'
        ? 'Physics simulation stopped because the workspace mode changed.'
        : 'Physics simulation stopped because the project was closed.',
    );
  });
}

connectSimulationManager();
