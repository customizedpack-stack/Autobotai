import type { Vec3 } from '../../../types/scene';

/**
 * Simple environments (Phase 5): a ground plane plus optional static obstacles.
 * A full environment editor belongs to a later phase (C5 Environment Connector).
 */
export interface StaticObstacle {
  id: string;
  /** Center position (m). */
  position: Vec3;
  /** Full size (m). */
  size: Vec3;
  /** Rotation about +Y (rad). */
  yaw: number;
  color: string;
}

export type EnvironmentId = 'floor' | 'obstacles';

export interface EnvironmentPreset {
  id: EnvironmentId;
  name: string;
  description: string;
  obstacles: StaticObstacle[];
}

export const ENVIRONMENTS: readonly EnvironmentPreset[] = [
  { id: 'floor', name: 'Empty floor', description: 'Flat ground only.', obstacles: [] },
  {
    id: 'obstacles',
    name: 'Obstacle course',
    description: 'A wall ahead, two blocks and a low step.',
    obstacles: [
      { id: 'wall', position: [1.4, 0.15, 0], size: [0.1, 0.3, 1.2], yaw: 0, color: '#64748B' },
      { id: 'block-left', position: [0.6, 0.1, -0.7], size: [0.25, 0.2, 0.25], yaw: 0.4, color: '#475569' },
      { id: 'block-right', position: [0.6, 0.1, 0.7], size: [0.25, 0.2, 0.25], yaw: -0.4, color: '#475569' },
      { id: 'step', position: [-0.9, 0.0125, 0], size: [0.4, 0.025, 0.8], yaw: 0, color: '#334155' },
    ],
  },
];

export function findEnvironment(id: EnvironmentId): EnvironmentPreset {
  return ENVIRONMENTS.find((e) => e.id === id) ?? ENVIRONMENTS[0]!;
}
