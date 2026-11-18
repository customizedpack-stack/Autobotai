import { create } from 'zustand';
import type { EnvironmentId } from '../engine/environments';

/**
 * Simulation engine choice and status (runtime only, never saved).
 *
 * engine 'kinematic': the Phase 3 movement engine moves the robot (default, every project).
 * engine 'physics':   the Rapier simulation moves the robot while it is running.
 * Only one of them ever controls the robot.
 */
export type SimulationEngine = 'kinematic' | 'physics';
export type SimulationRunState = 'stopped' | 'starting' | 'running' | 'paused';

export interface SimulationSettings {
  gravityEnabled: boolean;
  environment: EnvironmentId;
  /** Show collision shapes, joints, velocities and contacts in the viewport. */
  debug: boolean;
}

export interface SimulationInfo {
  bodies: number;
  joints: number;
  colliders: number;
  totalMass: number;
  /** Simulated time since start (s). */
  simTime: number;
  /** Average physics time per tick (ms). */
  stepMs: number;
  /** Bodies currently awake. */
  awake: number;
  issues: string[];
}

interface SimulationStoreState {
  engine: SimulationEngine;
  state: SimulationRunState;
  settings: SimulationSettings;
  info: SimulationInfo;
  error: string | null;
  set: (patch: Partial<Omit<SimulationStoreState, 'set'>>) => void;
}

export const EMPTY_INFO: SimulationInfo = { bodies: 0, joints: 0, colliders: 0, totalMass: 0, simTime: 0, stepMs: 0, awake: 0, issues: [] };

export const useSimulationStore = create<SimulationStoreState>((set) => ({
  engine: 'kinematic',
  state: 'stopped',
  settings: { gravityEnabled: true, environment: 'floor', debug: false },
  info: EMPTY_INFO,
  error: null,
  set: (patch) => set(patch),
}));
