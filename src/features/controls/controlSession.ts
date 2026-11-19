import { bus } from '../../core/bus/connectorBus';
import { useRobotStateStore, type WorkspaceMode } from '../../stores/robotStateStore';
import { useSceneStore } from '../../stores/sceneStore';
import { log } from '../../utils/logger';
import { shutdown } from './movementEngine';

/**
 * Build Mode ↔ Control Mode.
 * Build Mode edits the design. Control Mode drives the robot; editing is
 * locked so driving cannot change the design by accident. Leaving Control
 * Mode stops all motion and returns the robot to its design pose.
 */

type SessionEndListener = (reason: SessionEndReason) => void;
export type SessionEndReason = 'mode-change' | 'project-closed';
const sessionEndListeners = new Set<SessionEndListener>();

/**
 * Run code just BEFORE the live robot session ends (mode change, project closed),
 * so a running Code Studio program can be stopped first. Returns an unsubscribe function.
 */
export function onSessionEnd(listener: SessionEndListener): () => void {
  sessionEndListeners.add(listener);
  return () => sessionEndListeners.delete(listener);
}

function notifySessionEnd(reason: SessionEndReason): void {
  for (const listener of [...sessionEndListeners]) {
    try {
      listener(reason);
    } catch (error) {
      log.error('control', `Session cleanup failed: ${String(error instanceof Error ? error.message : error)}`);
    }
  }
}

const MODE_MESSAGES: Record<WorkspaceMode, string> = {
  build: 'Build Mode: editing unlocked. The robot is back in its design pose.',
  control: 'Control Mode: keyboard and buttons now drive the robot. Editing is locked. Choose the Kinematic or Physics engine in the Simulation panel.',
  code: 'Code Studio: programs drive the robot. Editing is locked. Choose the Kinematic or Physics engine in the Simulation panel.',
  environment: 'Environment Editor (Edit Mode): build and change the environment. The robot design is locked. Use Test Environment to run the robot in it.',
};

export function setWorkspaceMode(mode: WorkspaceMode): void {
  const robot = useRobotStateStore.getState();
  if (robot.mode === mode) return;
  notifySessionEnd('mode-change');
  shutdown();
  robot.resetRuntime();
  robot.setMode(mode);
  bus.publish('robot.modeChanged', { mode });
  log.info('control', MODE_MESSAGES[mode]);
}

/** M key: Build ↔ Control. From Code Studio it returns to Build Mode. */
export function toggleWorkspaceMode(): void {
  setWorkspaceMode(useRobotStateStore.getState().mode === 'build' ? 'control' : 'build');
}

/** Copy the live (driven) pose of moved components into the design, as ONE undo step. */
export function applyPoseToDesign(): boolean {
  const { rootPoses } = useRobotStateStore.getState();
  const ids = Object.keys(rootPoses);
  if (ids.length === 0) return false;
  const scene = useSceneStore.getState();
  scene.applyModel('Apply driven pose', {
    objects: scene.objects.map((o) => (rootPoses[o.id] ? { ...o, transform: rootPoses[o.id]! } : o)),
  });
  useRobotStateStore.getState().patch({ rootPoses: {} });
  log.success('control', 'Applied the driven pose to the design. Use Undo to revert it.');
  return true;
}

/** Leave Control Mode and clear live state (used when a project closes). */
export function endControlSession(): void {
  notifySessionEnd('project-closed');
  shutdown();
  const robot = useRobotStateStore.getState();
  robot.resetRuntime();
  robot.setMode('build');
}
