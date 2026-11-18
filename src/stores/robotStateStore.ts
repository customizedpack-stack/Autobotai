import { create } from 'zustand';
import type { ActuatorCommandState } from '../types/actuator';
import type { Transform } from '../types/scene';

/**
 * Live robot state while controlling it (Control Mode or Code Studio). This is RUNTIME
 * state: it is never saved with the project and never enters undo history.
 * The design pose stays in sceneStore; Reset returns to it, and "Apply
 * current pose to design" copies a live pose into the design as one undo step.
 *
 * In Phase 5 the physics engine will own this state (Sim State Stream, C4).
 */

/**
 * build:   edit the design.
 * control: drive with keys and buttons (Phase 3).
 * code:    Code Studio programs drive the robot (Phase 4). Like Control Mode,
 *          design editing is locked; unlike it, the keyboard does not drive.
 */
export type WorkspaceMode = 'build' | 'control' | 'code';

/** Modes in which C2 accepts movement commands. */
export function canDrive(mode: WorkspaceMode): boolean {
  return mode === 'control' || mode === 'code';
}

/** Modes in which the saved design cannot be edited. */
export function isDesignLocked(mode: WorkspaceMode): boolean {
  return mode !== 'build';
}

export type MovementStatus = 'idle' | 'moving' | 'stopped' | 'limited';

export interface ActuatorRuntime {
  /** Live target: rad/s for velocity control, joint position for position control. */
  target: number;
  /** Live velocity of the driven joint. */
  velocity: number;
  state: ActuatorCommandState;
}

export interface MovementState {
  status: MovementStatus;
  /** Normalized intent from commands (−1 … 1). */
  intent: { linear: number; angular: number };
  /** Applied twist after speed scaling and motor limits (m/s, rad/s). */
  twist: { linear: number; angular: number };
  wheels: { left: number; right: number } | null;
  lastCommand: { id: string; type: string } | null;
  lastError: string | null;
  /** Distance driven since the last reset, m. */
  distance: number;
}

const IDLE_MOVEMENT: MovementState = {
  status: 'idle',
  intent: { linear: 0, angular: 0 },
  twist: { linear: 0, angular: 0 },
  wheels: null,
  lastCommand: null,
  lastError: null,
  distance: 0,
};

interface RobotState {
  mode: WorkspaceMode;
  /** 0 … 100. */
  speedPercent: number;
  /** Live transforms of moving root components (overrides the design transform while controlling). */
  rootPoses: Record<string, Transform>;
  /** Live joint positions (rad or m). Missing = 0 (design pose). */
  jointPositions: Record<string, number>;
  actuators: Record<string, ActuatorRuntime>;
  movement: MovementState;

  setMode: (mode: WorkspaceMode) => void;
  setSpeedPercent: (value: number) => void;
  patch: (next: Partial<Pick<RobotState, 'rootPoses' | 'jointPositions' | 'actuators'>> & { movement?: Partial<MovementState> }) => void;
  /** Clear all live state (design pose, no movement). */
  resetRuntime: () => void;
}

export const useRobotStateStore = create<RobotState>((set, get) => ({
  mode: 'build',
  speedPercent: 50,
  rootPoses: {},
  jointPositions: {},
  actuators: {},
  movement: IDLE_MOVEMENT,

  setMode: (mode) => set({ mode }),
  setSpeedPercent: (value) => set({ speedPercent: Math.max(0, Math.min(100, Math.round(value))) }),
  patch: ({ movement, ...rest }) => set({ ...rest, ...(movement ? { movement: { ...get().movement, ...movement } } : {}) }),
  resetRuntime: () => set({ rootPoses: {}, jointPositions: {}, actuators: {}, movement: IDLE_MOVEMENT }),
}));
