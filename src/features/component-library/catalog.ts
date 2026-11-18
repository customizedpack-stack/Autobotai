import type { ComponentCategory, PrimitiveGeometry } from '../../types/scene';

export interface ComponentDefinition {
  id: string;
  name: string;
  category: ComponentCategory;
  description: string;
  geometry: PrimitiveGeometry;
  color: string;
  /** Default rotation in radians (e.g. wheels lie on their side). */
  rotation?: [number, number, number];
  /** Which phase turns this placeholder into a working component. */
  functionalIn: string;
}

export interface ComponentCategoryInfo {
  id: ComponentCategory;
  label: string;
}

export const COMPONENT_CATEGORIES: readonly ComponentCategoryInfo[] = [
  { id: 'body', label: 'Bodies' },
  { id: 'chassis', label: 'Chassis' },
  { id: 'wheel', label: 'Wheels' },
  { id: 'motor', label: 'Motors' },
  { id: 'sensor', label: 'Sensors' },
  { id: 'joint', label: 'Joints' },
  { id: 'other', label: 'Other Components' },
];

const HALF_PI = Math.PI / 2;

/**
 * Phase 1 component catalog. Every entry is a primitive placeholder: it can be
 * added, selected and transformed, but has no mechanical or electrical
 * behavior yet. Behavior arrives in the phase named by `functionalIn`.
 */
export const COMPONENT_CATALOG: readonly ComponentDefinition[] = [
  // Bodies
  { id: 'body-box', name: 'Box Body', category: 'body', description: 'Rectangular rigid body.', geometry: { shape: 'box', size: [0.3, 0.2, 0.3] }, color: '#64748B', functionalIn: 'Physics: mass and collisions' },
  { id: 'body-cylinder', name: 'Cylinder Body', category: 'body', description: 'Round rigid body.', geometry: { shape: 'cylinder', radius: 0.15, height: 0.2 }, color: '#64748B', functionalIn: 'Physics: mass and collisions' },
  { id: 'body-sphere', name: 'Sphere Body', category: 'body', description: 'Spherical rigid body.', geometry: { shape: 'sphere', radius: 0.12 }, color: '#64748B', functionalIn: 'Physics: mass and collisions' },
  { id: 'body-plate', name: 'Mounting Plate', category: 'body', description: 'Thin plate for mounting parts.', geometry: { shape: 'box', size: [0.4, 0.02, 0.3] }, color: '#475569', functionalIn: 'Phase 2 (attachment)' },
  // Chassis
  { id: 'chassis-rect', name: 'Rectangular Chassis', category: 'chassis', description: 'Base frame for a wheeled robot.', geometry: { shape: 'box', size: [0.4, 0.1, 0.28] }, color: '#3B82F6', functionalIn: 'Phase 2 (attachment)' },
  { id: 'chassis-round', name: 'Round Chassis', category: 'chassis', description: 'Disc-shaped base frame.', geometry: { shape: 'cylinder', radius: 0.18, height: 0.06 }, color: '#3B82F6', functionalIn: 'Phase 2 (attachment)' },
  // Wheels
  { id: 'wheel-standard', name: 'Standard Wheel', category: 'wheel', description: 'Rubber drive wheel, 140 mm.', geometry: { shape: 'cylinder', radius: 0.07, height: 0.035 }, color: '#2F3A4C', rotation: [HALF_PI, 0, 0], functionalIn: 'Phase 3 (drive control)' },
  { id: 'wheel-large', name: 'Large Wheel', category: 'wheel', description: 'Rough-terrain wheel, 200 mm.', geometry: { shape: 'cylinder', radius: 0.1, height: 0.05 }, color: '#2F3A4C', rotation: [HALF_PI, 0, 0], functionalIn: 'Phase 3 (drive control)' },
  { id: 'wheel-caster', name: 'Caster Ball', category: 'wheel', description: 'Passive support ball.', geometry: { shape: 'sphere', radius: 0.025 }, color: '#94A3B8', functionalIn: 'Physics: low-friction contact' },
  // Motors
  { id: 'motor-dc', name: 'DC Motor', category: 'motor', description: 'Geared DC motor for wheels.', geometry: { shape: 'cylinder', radius: 0.02, height: 0.07 }, color: '#F59E0B', rotation: [HALF_PI, 0, 0], functionalIn: 'Phase 3 (motors)' },
  { id: 'motor-servo', name: 'Servo Motor', category: 'motor', description: 'Position-controlled servo.', geometry: { shape: 'box', size: [0.04, 0.04, 0.02] }, color: '#F59E0B', functionalIn: 'Phase 3 (motors)' },
  { id: 'motor-stepper', name: 'Stepper Motor', category: 'motor', description: 'Precise stepping motor.', geometry: { shape: 'box', size: [0.042, 0.042, 0.04] }, color: '#D97706', functionalIn: 'Phase 3 (motors)' },
  // Sensors
  { id: 'sensor-distance', name: 'Distance Sensor', category: 'sensor', description: 'Ultrasonic / IR range finder.', geometry: { shape: 'box', size: [0.03, 0.025, 0.05] }, color: '#22C55E', functionalIn: 'Phase 6 (sensors)' },
  { id: 'sensor-camera', name: 'Camera', category: 'sensor', description: 'RGB camera module.', geometry: { shape: 'box', size: [0.03, 0.03, 0.03] }, color: '#10B981', functionalIn: 'Phase 6 (sensors)' },
  { id: 'sensor-imu', name: 'IMU', category: 'sensor', description: 'Accelerometer and gyroscope.', geometry: { shape: 'box', size: [0.025, 0.006, 0.025] }, color: '#14B8A6', functionalIn: 'Phase 6 (sensors)' },
  { id: 'sensor-lidar', name: 'Lidar', category: 'sensor', description: '360° laser scanner.', geometry: { shape: 'cylinder', radius: 0.035, height: 0.04 }, color: '#06B6D4', functionalIn: 'Phase 6 (sensors)' },
  // Joints
  { id: 'joint-revolute', name: 'Revolute Joint', category: 'joint', description: 'Rotates around one axis.', geometry: { shape: 'sphere', radius: 0.03 }, color: '#A855F7', functionalIn: 'Phase 2 (joints)' },
  { id: 'joint-prismatic', name: 'Prismatic Joint', category: 'joint', description: 'Slides along one axis.', geometry: { shape: 'box', size: [0.08, 0.03, 0.03] }, color: '#A855F7', functionalIn: 'Phase 2 (joints)' },
  { id: 'joint-fixed', name: 'Fixed Joint', category: 'joint', description: 'Rigid connection.', geometry: { shape: 'box', size: [0.03, 0.03, 0.03] }, color: '#8B5CF6', functionalIn: 'Phase 2 (joints)' },
  // Other
  { id: 'other-battery', name: 'Battery Pack', category: 'other', description: 'Power source.', geometry: { shape: 'box', size: [0.1, 0.03, 0.06] }, color: '#EF4444', functionalIn: 'Phase 7 (power)' },
  { id: 'other-controller', name: 'Controller Board', category: 'other', description: 'Microcontroller board.', geometry: { shape: 'box', size: [0.07, 0.01, 0.05] }, color: '#0EA5E9', functionalIn: 'Phase 4 (code)' },
  { id: 'other-gripper', name: 'Gripper', category: 'other', description: 'Two-finger end effector.', geometry: { shape: 'box', size: [0.06, 0.08, 0.03] }, color: '#E2E8F0', functionalIn: 'Phase 7 (arms)' },
  { id: 'other-cone', name: 'Marker Cone', category: 'other', description: 'Reference marker.', geometry: { shape: 'cone', radius: 0.05, height: 0.12 }, color: '#F97316', functionalIn: 'Phase 7 (environments)' },
];

export function findComponent(id: string): ComponentDefinition | undefined {
  return COMPONENT_CATALOG.find((c) => c.id === id);
}

export function searchComponents(query: string): ComponentDefinition[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...COMPONENT_CATALOG];
  return COMPONENT_CATALOG.filter(
    (c) =>
      c.name.toLowerCase().includes(q) ||
      c.description.toLowerCase().includes(q) ||
      c.category.includes(q),
  );
}
