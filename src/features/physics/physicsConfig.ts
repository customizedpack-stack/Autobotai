import type { ComponentCategory } from '../../types/scene';

/**
 * Physics configuration (Phase 5). SI units throughout: meters, kilograms,
 * seconds, newtons, newton-meters, radians. Y is up.
 */

/** Fixed simulation tick (s): the same 60 Hz as the kinematic engine. */
export const FIXED_STEP = 1 / 60;
/** Solver substeps per tick: the world integrates at 240 Hz for stable joints and contacts. */
export const SUBSTEPS = 4;
/** Longest real frame time fed to the accumulator (s): protects against tab-switch spikes. */
export const MAX_FRAME_SECONDS = 0.25;
/** At most this many ticks per animation frame; extra time is dropped (never a spiral of death). */
export const MAX_TICKS_PER_FRAME = 5;
/** Solver iterations per substep. */
export const SOLVER_ITERATIONS = 8;

export const EARTH_GRAVITY = 9.81;

/** Default density by category (kg/m³). Robot parts are mostly hollow shells, so densities are low. */
export const DEFAULT_DENSITY: Record<ComponentCategory, number> = {
  chassis: 250,
  body: 250,
  wheel: 600,
  motor: 2500,
  sensor: 600,
  joint: 400,
  other: 400,
};

/** Default friction by category. Wheels grip; everything else is moderate. */
export const DEFAULT_FRICTION: Record<ComponentCategory, number> = {
  chassis: 0.5,
  body: 0.5,
  wheel: 1.0,
  motor: 0.5,
  sensor: 0.5,
  joint: 0.5,
  other: 0.5,
};

/**
 * A wheel-category part rigidly attached without a joint (for example a caster ball)
 * cannot roll in a rigid-body model; low friction lets it slide like a caster.
 */
export const PASSIVE_CASTER_FRICTION = 0.02;
export const DEFAULT_RESTITUTION = 0.05;

export const GROUND_FRICTION = 0.9;
export const GROUND_RESTITUTION = 0.0;
/** Half size of the ground slab (m). Its top surface is at y = 0, matching the grid. */
export const GROUND_HALF_EXTENT = 50;

/** Collision groups (Rapier: membership << 16 | filter). Robot parts collide with the environment only. */
export const GROUP_ENVIRONMENT = 0x0001;
export const GROUP_ROBOT = 0x0002;
export const ROBOT_COLLISION_GROUPS = (GROUP_ROBOT << 16) | GROUP_ENVIRONMENT;
export const ENVIRONMENT_COLLISION_GROUPS = (GROUP_ENVIRONMENT << 16) | (GROUP_ROBOT | GROUP_ENVIRONMENT);

/**
 * Joint motor tuning. The engine's force-based motor applies
 * torque = factor × (target velocity − joint velocity), capped at the actuator's maxTorque.
 * The factor is chosen so that a speed error of MOTOR_SATURATION_SPEED already produces the
 * full rated torque, like a real motor driver (the engine solves this implicitly, so it stays stable).
 */
export const MOTOR_SATURATION_SPEED = 0.05;
/** Servo outer position loop gain (1/s): target speed = gain × error, limited by max velocity. */
export const SERVO_POSITION_GAIN = 8;
/** Servo arrival tolerance: radians (revolute) or meters (prismatic). */
export const SERVO_TOLERANCE = { revolute: 0.01, prismatic: 0.002 } as const;
/** A joint target that is not reached in (travel time × 3 + 3 s) ends as "stopped" (blocked or too weak). */
export const SERVO_TIMEOUT_EXTRA_S = 3;

/** Limits accepted for per-part physics values. */
export const PHYSICS_LIMITS = {
  mass: { min: 0.001, max: 10_000 },
  density: { min: 1, max: 30_000 },
  friction: { min: 0, max: 2 },
  restitution: { min: 0, max: 1 },
} as const;
