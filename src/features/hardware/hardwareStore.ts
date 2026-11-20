import { create } from 'zustand';
import type { PreparedProgram } from './deploy/programCheck';
import type { DeviceState, DistanceStatus } from './protocol/protocol';
import type { TransportKind } from './transport/types';

/**
 * Live hardware connection state (never saved: sessions, telemetry and the
 * deployment are per connection). The project's saved hardware profile and
 * calibration live in the Robot Blueprint (blueprint.hardwareProfile).
 */

export type ConnectionState =
  | 'not-connected'
  | 'waiting-permission'
  | 'connecting'
  | 'connected'
  | 'running'
  | 'stopping'
  | 'disconnected'
  | 'fault'
  | 'emergency-stopped';

export const CONNECTION_LABELS: Record<ConnectionState, string> = {
  'not-connected': 'Not connected',
  'waiting-permission': 'Waiting for permission',
  connecting: 'Connecting',
  connected: 'Connected',
  running: 'Running',
  stopping: 'Stopping',
  disconnected: 'Disconnected',
  fault: 'Fault',
  'emergency-stopped': 'Emergency stopped',
};

export interface DeviceInfo {
  device: string;
  board: string;
  firmware: string;
  protocol: number;
  caps: string[];
  encoders: boolean;
  maxDriveMs: number;
  heartbeatMs: number;
}

export interface Telemetry {
  at: number;
  deviceTime: number;
  enabled: boolean;
  left: number;
  right: number;
  targetLeft: number;
  targetRight: number;
  distanceMm: number | null;
  distanceStatus: DistanceStatus;
  program: string | null;
}

export type Activity = 'idle' | 'jog' | 'program' | 'calibration';
export type ExecutionTarget = 'simulation' | 'physical';

export interface LogEntry {
  at: number;
  dir: 'tx' | 'rx' | 'info' | 'error';
  text: string;
}

interface HardwareState {
  phase: 'idle' | 'waiting-permission' | 'connecting' | 'open' | 'lost';
  method: TransportKind | null;
  transportLabel: string | null;
  device: DeviceInfo | null;
  deviceState: DeviceState | null;
  /** Commands were sent and the device has not confirmed the stop yet. */
  stopping: boolean;
  lastRxAt: number | null;
  latencyMs: number | null;
  heartbeat: 'off' | 'ok' | 'late' | 'lost';
  lastFault: { code: string; at: number } | null;
  error: string | null;
  reconnectAvailable: boolean;
  telemetry: Telemetry | null;
  activity: Activity;
  executionTarget: ExecutionTarget;
  prepared: PreparedProgram | null;
  deployed: { programId: string; name: string; hash: string; at: number } | null;
  invalidLines: number;
  log: LogEntry[];
  set: (patch: Partial<Omit<HardwareState, 'set' | 'addLog'>>) => void;
  addLog: (dir: LogEntry['dir'], text: string) => void;
}

export const LOG_LIMIT = 200;

export const useHardwareStore = create<HardwareState>((set, get) => ({
  phase: 'idle',
  method: null,
  transportLabel: null,
  device: null,
  deviceState: null,
  stopping: false,
  lastRxAt: null,
  latencyMs: null,
  heartbeat: 'off',
  lastFault: null,
  error: null,
  reconnectAvailable: false,
  telemetry: null,
  activity: 'idle',
  executionTarget: 'simulation',
  prepared: null,
  deployed: null,
  invalidLines: 0,
  log: [],
  set: (patch) => set(patch),
  addLog: (dir, text) => set({ log: [...get().log, { at: Date.now(), dir, text: text.slice(0, 200) }].slice(-LOG_LIMIT) }),
}));

/** The single displayed state (handshake must be complete before "Connected"). */
export function connectionState(s: Pick<HardwareState, 'phase' | 'deviceState' | 'stopping' | 'activity'>): ConnectionState {
  if (s.phase === 'waiting-permission') return 'waiting-permission';
  if (s.phase === 'connecting') return 'connecting';
  if (s.phase === 'lost') return 'disconnected';
  if (s.phase !== 'open') return 'not-connected';
  if (s.deviceState === 'estop') return 'emergency-stopped';
  if (s.deviceState === 'fault') return 'fault';
  if (s.stopping) return 'stopping';
  if (s.deviceState === 'armed' && s.activity !== 'idle') return 'running';
  return 'connected';
}
