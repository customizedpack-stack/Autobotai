import { bus } from '../../../core/bus/connectorBus';
import { commandContext } from '../../controls/commandBus';
import { onSessionEnd, setWorkspaceMode } from '../../controls/controlSession';
import { robotControl } from '../../controls/robotControlApi';
import { useRobotStateStore } from '../../../stores/robotStateStore';
import { useSceneStore } from '../../../stores/sceneStore';
import { createId } from '../../../utils/id';
import { log } from '../../../utils/logger';
import { buildWorkerSource } from '../sandbox/workerRuntime';
import { createFrameSandbox } from '../sandbox/sandboxHost';
import { checkRequirements, checkSyntax, usesDrive, type ProgramIssue, type ProgramRequirements } from '../utils/programValidation';
import { DEFAULT_LIMITS, type ExecutionLimits } from './executionLimits';
import { IDLE_STATUS, isActiveState, useExecutionStore } from './executionStore';
import type { ExecutionError, ExecutionOutcome, ExecutionState } from './executionTypes';
import { BridgeError, HostBridge } from './hostBridge';
import { parseWorkerMessage, type HostMessage } from './messageProtocol';
import type { SandboxFactory, SandboxHandle } from './sandboxTypes';

/**
 * Code Studio execution manager — one program at a time.
 *
 *   Program (Blockly → generated JS, or JavaScript)
 *     → sandbox worker (restricted runtime)
 *     → validated message → HostBridge → robotControl (source 'code')
 *     → C2 Command Bus → movement engine → robotStateStore
 *
 * Every run gets a unique session id. When a run ends for ANY reason (Stop,
 * completion, error, timeout, crash, leaving Code Studio, closing the
 * project), the session is invalidated first, the worker is killed, and the
 * robot is stopped through the API. Late messages from an old session are
 * ignored.
 */

export interface RunRequest {
  programId: string;
  programName: string;
  language: 'blockly' | 'javascript';
  /** JavaScript to execute (for Blockly: the generated code). */
  code: string;
  /** Extra robot requirements known statically (Blockly). JavaScript is scanned for driving commands. */
  requirements?: Partial<ProgramRequirements>;
}

export type RunResult = { ok: true; sessionId: string } | { ok: false; issues: ProgramIssue[] };

interface Session {
  id: string;
  programId: string;
  bridge: HostBridge;
  sandbox: SandboxHandle | null;
  lineOffset: number;
  invalidMessages: number;
  logsThisSecond: number;
  logSecond: number;
  logsTotal: number;
  logDropWarned: boolean;
  startTimer: ReturnType<typeof setTimeout> | null;
  /** Incoming-message rate window (per session). */
  messageWindowStart: number;
  messagesInWindow: number;
  messageDropWarned: boolean;
}

let limits: ExecutionLimits = DEFAULT_LIMITS;
let sandboxFactory: ((lineOffset: number) => SandboxFactory) | null = null;
let session: Session | null = null;
let ticker: ReturnType<typeof setInterval> | null = null;
let lastTick = 0;

const status = () => useExecutionStore.getState();
const setStatus = (patch: Parameters<ReturnType<typeof useExecutionStore.getState>['set']>[0]) => useExecutionStore.getState().set(patch);

function publish(state: ExecutionState, detail?: string): void {
  const { sessionId, programId } = status();
  if (sessionId && programId) bus.publish('codeStudio.execution', { sessionId, programId, state, detail });
}

/** Tests: smaller limits and a fake sandbox. Pass nothing to restore the defaults. */
export function configureExecution(options: { limits?: Partial<ExecutionLimits>; sandbox?: ((lineOffset: number) => SandboxFactory) | null } = {}): void {
  limits = { ...DEFAULT_LIMITS, ...options.limits };
  sandboxFactory = options.sandbox ?? null;
}

export function getExecutionLimits(): ExecutionLimits {
  return limits;
}

/** Validate a program for the open robot without running it. */
export function preflight(request: Pick<RunRequest, 'code' | 'requirements' | 'language'>): ProgramIssue[] {
  if (!request.code.trim()) return [{ message: 'The program is empty.', severity: 'error' }];
  const syntax = checkSyntax(request.code);
  if (syntax.length > 0) return syntax;
  const requirements: ProgramRequirements = {
    usesDrive: request.requirements?.usesDrive ?? usesDrive(request.code),
    jointIds: request.requirements?.jointIds ?? [],
    jointTargets: request.requirements?.jointTargets ?? [],
  };
  return checkRequirements(requirements, commandContext());
}

/** Start a program. Fails without side effects when validation fails or a program is already running. */
export function runProgram(request: RunRequest): RunResult {
  if (isActiveState(status().state)) {
    return { ok: false, issues: [{ message: 'A program is already running. Stop it before starting another one.', severity: 'error' }] };
  }
  const issues = preflight(request).filter((i) => i.severity === 'error');
  if (issues.length > 0) {
    for (const issue of issues) log.error('code', issue.line ? `Line ${issue.line}: ${issue.message}` : issue.message);
    setStatus({ ...IDLE_STATUS, state: 'error', programId: request.programId, programName: request.programName, error: { message: issues[0]!.message, line: issues[0]!.line, kind: issues[0]!.message.startsWith('Syntax') ? 'syntax' : 'validation' }, lastOutcome: 'error' });
    return { ok: false, issues };
  }

  // Programs drive the robot in Code Studio mode (C2 accepts commands there).
  if (useRobotStateStore.getState().mode !== 'code') setWorkspaceMode('code');

  const id = createId('run');
  const { source, lineOffset } = buildWorkerSource(request.code, {
    sessionId: id,
    maxLogLength: limits.maxLogLength,
    // The same message limits are enforced inside the worker (at the source) and here (second layer).
    maxMessagesPerSecond: limits.maxMessagesPerSecond,
    terminateAtMessagesPerSecond: limits.terminateAtMessagesPerSecond,
  });
  const current: Session = {
    id,
    programId: request.programId,
    bridge: new HostBridge({ sessionId: id, limits, push: (message) => reply(current, message) }),
    sandbox: null,
    lineOffset,
    invalidMessages: 0,
    logsThisSecond: 0,
    logSecond: 0,
    logsTotal: 0,
    logDropWarned: false,
    startTimer: null,
    messageWindowStart: performance.now(),
    messagesInWindow: 0,
    messageDropWarned: false,
  };
  session = current;
  setStatus({ ...IDLE_STATUS, state: 'preparing', sessionId: id, programId: request.programId, programName: request.programName });
  publish('preparing');
  log.info('code', `Preparing "${request.programName}" (${request.language === 'blockly' ? 'Blockly' : 'JavaScript'}).`, { sessionId: id });

  const factory = (sandboxFactory ?? createFrameSandbox)(lineOffset);
  try {
    current.sandbox = factory({
      sessionId: id,
      workerSource: source,
      onWorkerMessage: (raw) => onWorkerMessage(current, raw),
      onWorkerError: (message, line) => {
        if (session === current) endRun('error', { message: `The program crashed: ${message}`, line, kind: 'runtime' });
      },
      onStartFailed: (message) => {
        if (session === current) endRun('error', { message: `Code execution could not start in this browser or hosting page (${message}).`, kind: 'sandbox' });
      },
    });
  } catch (error) {
    endRun('error', { message: `Code execution could not start: ${String(error instanceof Error ? error.message : error)}`, kind: 'sandbox' });
    return { ok: false, issues: [{ message: 'Code execution could not start.', severity: 'error' }] };
  }
  current.startTimer = setTimeout(() => {
    if (session === current && status().state === 'preparing') endRun('error', { message: 'The code sandbox did not start in time.', kind: 'sandbox' });
  }, limits.startTimeoutMs);
  return { ok: true, sessionId: id };
}

function reply(current: Session, message: HostMessage): void {
  if (session === current) current.sandbox?.send(message);
}

/**
 * General incoming-message rate protection, separate from the command-rate (HostBridge)
 * and console-log limits. Returns 'ok', 'reject' (over the per-second limit) or 'terminate'.
 */
function checkMessageRate(current: Session): 'ok' | 'reject' | 'terminate' {
  const now = performance.now();
  if (now - current.messageWindowStart >= 1000) {
    current.messageWindowStart = now;
    current.messagesInWindow = 0;
  }
  current.messagesInWindow += 1;
  if (current.messagesInWindow > limits.terminateAtMessagesPerSecond) return 'terminate';
  if (current.messagesInWindow > limits.maxMessagesPerSecond) return 'reject';
  return 'ok';
}

function onWorkerMessage(current: Session, raw: unknown): void {
  // Late messages from a stopped, replaced or terminated session are ignored (before any work).
  if (session !== current) return;
  // Messages that END the run (done / fail, for example the worker's own flood report) are never rate-filtered.
  const kind = (raw as { kind?: unknown } | null)?.kind;
  const rate = kind === 'done' || kind === 'fail' ? 'ok' : checkMessageRate(current);
  if (rate === 'terminate') {
    endRun('error', { message: `The program sent too many messages (more than ${limits.terminateAtMessagesPerSecond} per second) and was stopped.`, kind: 'security' });
    return;
  }
  if (rate === 'reject') {
    if (!current.messageDropWarned) {
      current.messageDropWarned = true;
      log.warning('code', `The program sends more than ${limits.maxMessagesPerSecond} messages per second; extra messages are rejected.`, { sessionId: current.id });
    }
    // A rejected robot call still gets an answer, so the program's promise settles.
    const call = raw as { kind?: unknown; id?: unknown; sessionId?: unknown };
    if (call && call.kind === 'call' && call.sessionId === current.id && typeof call.id === 'number' && Number.isInteger(call.id) && call.id > 0) {
      reply(current, { v: 1, kind: 'result', id: call.id, ok: false, error: `Too many messages: the limit is ${limits.maxMessagesPerSecond} per second.` });
    }
    return;
  }
  const parsed = parseWorkerMessage(raw, current.id);
  if (!parsed.ok) {
    current.invalidMessages += 1;
    log.warning('code', `Ignored an invalid message from the program (${parsed.reason}).`, { sessionId: current.id });
    if (current.invalidMessages > limits.maxInvalidMessages) {
      endRun('error', { message: 'The program sent too many invalid messages and was stopped.', kind: 'security' });
    }
    return;
  }
  const message = parsed.value;
  switch (message.kind) {
    case 'ready':
      if (status().state !== 'preparing') return;
      if (current.startTimer) clearTimeout(current.startTimer);
      current.startTimer = null;
      setStatus({ state: 'running', elapsedMs: 0 });
      startTicker();
      publish('running');
      log.info('code', 'Program started.', { sessionId: current.id });
      return;
    case 'call':
      current.bridge.handle(message.op, message.args).then(
        (value) => reply(current, { v: 1, kind: 'result', id: message.id, ok: true, value }),
        (error: unknown) => reply(current, { v: 1, kind: 'result', id: message.id, ok: false, error: error instanceof Error ? error.message : String(error) }),
      );
      return;
    case 'log':
      programLog(current, message.level, message.text);
      return;
    case 'done':
      endRun('completed');
      return;
    case 'fail':
      endRun('error', { message: message.message, line: message.line, kind: message.code === 'flood' ? 'security' : 'runtime' });
      return;
  }
}

function programLog(current: Session, level: 'info' | 'warning' | 'error', text: string): void {
  const second = Math.floor(performance.now() / 1000);
  if (second !== current.logSecond) {
    current.logSecond = second;
    current.logsThisSecond = 0;
  }
  current.logsThisSecond += 1;
  current.logsTotal += 1;
  if (current.logsThisSecond > limits.maxLogsPerSecond || current.logsTotal > limits.maxLogsPerRun) {
    if (!current.logDropWarned) {
      current.logDropWarned = true;
      log.warning('code', 'The program prints too many messages; some were not shown.', { sessionId: current.id });
    }
    return;
  }
  const message = `Program: ${text}`;
  if (level === 'error') log.error('code', message, { sessionId: current.id });
  else if (level === 'warning') log.warning('code', message, { sessionId: current.id });
  else log.info('code', message, { sessionId: current.id });
}

function startTicker(): void {
  stopTicker();
  lastTick = performance.now();
  ticker = setInterval(() => {
    const now = performance.now();
    const dt = now - lastTick;
    lastTick = now;
    const { state, elapsedMs } = status();
    if (state !== 'running') return;
    const next = elapsedMs + dt;
    setStatus({ elapsedMs: next });
    if (next > limits.maxRunMs) {
      endRun('timeout', { message: `Program stopped: it ran longer than the ${Math.round(limits.maxRunMs / 1000)} s limit.`, kind: 'timeout' });
    }
  }, 250);
}

function stopTicker(): void {
  if (ticker) clearInterval(ticker);
  ticker = null;
}

/** Invalidate the session, kill the worker, stop the robot through the API. */
function teardown(): Session | null {
  const ended = session;
  session = null;
  stopTicker();
  if (!ended) return null;
  if (ended.startTimer) clearTimeout(ended.startTimer);
  ended.sandbox?.destroy();
  ended.bridge.dispose();
  // Terminating the worker does not stop an already accepted motion: stop the robot explicitly.
  robotControl.stop('code');
  return ended;
}

function endRun(outcome: Exclude<ExecutionOutcome, 'stopped'>, error?: ExecutionError): void {
  const ended = teardown();
  if (!ended) return;
  const state: ExecutionState = outcome === 'completed' ? 'completed' : 'error';
  setStatus({ state, error: error ?? null, lastOutcome: outcome, pausePending: false });
  publish(state, error?.message);
  if (outcome === 'completed') log.success('code', 'Program completed. The robot was stopped.', { sessionId: ended.id });
  else log.error('code', error?.line ? `Line ${error.line}: ${error.message}` : (error?.message ?? 'The program failed.'), { sessionId: ended.id });
}

/**
 * Stop: always available, even after an error. Kills the program (if any) and
 * stops the robot immediately.
 */
export function stopProgram(reason = 'Program stopped.'): void {
  pausedBySimulation = false;
  const wasActive = Boolean(session);
  if (wasActive) setStatus({ state: 'stopping' });
  const ended = teardown();
  if (!ended) {
    // No program running: still stop the robot (Stop must always work).
    robotControl.stop('code');
    if (isActiveState(status().state)) setStatus({ state: 'idle' });
    return;
  }
  setStatus({ state: 'idle', lastOutcome: 'stopped', pausePending: false, error: null });
  bus.publish('codeStudio.execution', { sessionId: ended.id, programId: ended.programId, state: 'idle', detail: reason });
  log.info('code', reason, { sessionId: ended.id });
}

/** Pause: stop the robot, hold the program at its next robot call or checkpoint. */
export function pauseProgram(): boolean {
  if (!session || status().state !== 'running') return false;
  session.bridge.pause();
  session.sandbox?.send({ v: 1, kind: 'pause' });
  setStatus({ state: 'paused' });
  publish('paused');
  log.info('code', 'Program paused. The robot was stopped; it continues from the same point when you resume.', { sessionId: session.id });
  return true;
}

export function resumeProgram(): boolean {
  if (!session || status().state !== 'paused') return false;
  lastTick = performance.now();
  setStatus({ state: 'running' });
  session.bridge.resume();
  session.sandbox?.send({ v: 1, kind: 'resume' });
  publish('running', 'resumed');
  log.info('code', 'Program resumed.', { sessionId: session.id });
  return true;
}

/** Reset Robot: stops a running program first, then uses the existing API reset (runtime pose only, design unchanged). */
export function resetRobotFromCodeStudio(): void {
  if (session) stopProgram('Program stopped to reset the robot.');
  const result = robotControl.reset('code');
  if (result.ok) log.info('code', 'Robot reset to its design pose.');
}

/** Show problems found before running (for example by the Blockly checks) like a failed preflight. */
export function reportProgramIssues(programId: string, programName: string, issues: ProgramIssue[], kind: ExecutionError['kind'] = 'validation'): void {
  if (isActiveState(status().state)) return;
  for (const issue of issues) {
    const text = issue.line ? `Line ${issue.line}: ${issue.message}` : issue.message;
    if (issue.severity === 'error') log.error('code', text);
    else log.warning('code', text);
  }
  const first = issues.find((i) => i.severity === 'error');
  if (first) setStatus({ ...IDLE_STATUS, state: 'error', programId, programName, error: { message: first.message, line: first.line, kind }, lastOutcome: 'error' });
}

/** Clear a finished run's status (after the user edits or switches programs). */
export function clearExecutionStatus(): void {
  if (!isActiveState(status().state)) setStatus({ ...IDLE_STATUS });
}

export function isProgramRunning(): boolean {
  return session !== null;
}

let connected = false;

/** Stop programs when the robot session ends (mode change, project closed). Safe to call more than once. */
export function connectExecutionManager(): void {
  if (connected) return;
  connected = true;
  onSessionEnd((reason) => {
    if (!session) return;
    stopProgram(reason === 'mode-change' ? 'Program stopped because you left Code Studio.' : 'Program stopped because the project was closed.');
  });
  bus.subscribe('project.deleted', ({ projectId }) => {
    if (session && useSceneStore.getState().projectId === projectId) stopProgram('Program stopped because the project was deleted.');
  });
  // Phase 5: programs follow the physics simulation. Pausing the simulation pauses the
  // program; resuming resumes it; stopping the simulation or switching engines stops it.
  bus.subscribe('simulation.changed', ({ engine, state, previousEngine, previousState }) => {
    if (!session) return;
    if (engine !== previousEngine) {
      stopProgram('Program stopped because the simulation engine changed.');
      return;
    }
    if (engine !== 'physics') return;
    if (state === 'stopped') {
      stopProgram('Program stopped because the physics simulation stopped.');
    } else if (state === 'paused' && previousState === 'running' && status().state === 'running') {
      if (pauseProgram()) pausedBySimulation = true;
    } else if (state === 'running' && previousState === 'paused' && pausedBySimulation) {
      pausedBySimulation = false;
      resumeProgram();
    }
  });
}

/** True while the program is paused because the physics simulation was paused. */
let pausedBySimulation = false;

export { BridgeError };

// Connect as soon as Code Studio's code is loaded (it is lazy-loaded, so the dashboard stays small).
connectExecutionManager();
