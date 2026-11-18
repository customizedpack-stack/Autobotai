import type { RobotCategory } from '../../types/project';
import type { SceneObjectDraft } from '../../types/scene';

export interface RobotCategoryInfo {
  id: RobotCategory;
  label: string;
  description: string;
}

export const ROBOT_CATEGORIES: readonly RobotCategoryInfo[] = [
  { id: 'mobile', label: 'Mobile Robot', description: 'Wheeled or tracked robots that drive and navigate.' },
  { id: 'arm', label: 'Robotic Arm', description: 'Articulated arms for reaching, picking and placing.' },
  { id: 'humanoid', label: 'Humanoid', description: 'Two-legged robots with arms and a head.' },
  { id: 'drone', label: 'Drone', description: 'Multirotor flying robots.' },
  { id: 'industrial', label: 'Industrial', description: 'Work-cell robots for repeatable automation.' },
  { id: 'quadruped', label: 'Quadruped', description: 'Four-legged walking robots.' },
];

export interface RobotTemplate {
  id: string;
  name: string;
  category: RobotCategory;
  summary: string;
  /** Short facts shown on the template card. */
  highlights: string[];
  /** Builds the placeholder scene objects for a new project. */
  build: () => SceneObjectDraft[];
}

const HALF_PI = Math.PI / 2;

const blank: RobotTemplate = {
  id: 'blank',
  name: 'Blank Robot',
  category: 'mobile',
  summary: 'Start from a single base body and build your own design.',
  highlights: ['1 base body', 'Any category'],
  build: () => [
    {
      name: 'Base Body',
      category: 'body',
      geometry: { shape: 'box', size: [0.3, 0.1, 0.3] },
      color: '#64748B',
      transform: { position: [0, 0.05, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      componentId: 'body-box',
      description: 'Starting body for your robot.',
    },
  ],
};

const explorerBot: RobotTemplate = {
  id: 'explorer-bot',
  name: 'Explorer Bot',
  category: 'mobile',
  summary: 'Two-wheel differential-drive robot with a front distance sensor. The first MVP robot.',
  highlights: ['2 drive wheels', '2 DC motors', '1 distance sensor'],
  build: () => [
    { name: 'Chassis', category: 'chassis', componentId: 'chassis-rect', description: 'Main frame of Explorer Bot.', geometry: { shape: 'box', size: [0.4, 0.1, 0.26] }, color: '#3B82F6', transform: { position: [0, 0.11, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } },
    { name: 'Top Plate', category: 'body', componentId: 'body-plate', description: 'Mounting deck.', geometry: { shape: 'box', size: [0.34, 0.015, 0.22] }, color: '#334155', transform: { position: [-0.02, 0.17, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } },
    { name: 'Left Wheel', category: 'wheel', componentId: 'wheel-standard', description: 'Left drive wheel.', geometry: { shape: 'cylinder', radius: 0.07, height: 0.035 }, color: '#2F3A4C', transform: { position: [0.06, 0.07, 0.155], rotation: [HALF_PI, 0, 0], scale: [1, 1, 1] } },
    { name: 'Right Wheel', category: 'wheel', componentId: 'wheel-standard', description: 'Right drive wheel.', geometry: { shape: 'cylinder', radius: 0.07, height: 0.035 }, color: '#2F3A4C', transform: { position: [0.06, 0.07, -0.155], rotation: [HALF_PI, 0, 0], scale: [1, 1, 1] } },
    { name: 'Left Motor', category: 'motor', componentId: 'motor-dc', description: 'Drives the left wheel.', geometry: { shape: 'cylinder', radius: 0.02, height: 0.07 }, color: '#F59E0B', transform: { position: [0.06, 0.07, 0.09], rotation: [HALF_PI, 0, 0], scale: [1, 1, 1] } },
    { name: 'Right Motor', category: 'motor', componentId: 'motor-dc', description: 'Drives the right wheel.', geometry: { shape: 'cylinder', radius: 0.02, height: 0.07 }, color: '#F59E0B', transform: { position: [0.06, 0.07, -0.09], rotation: [HALF_PI, 0, 0], scale: [1, 1, 1] } },
    { name: 'Caster Ball', category: 'wheel', componentId: 'wheel-caster', description: 'Rear support.', geometry: { shape: 'sphere', radius: 0.03 }, color: '#94A3B8', transform: { position: [-0.15, 0.03, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } },
    { name: 'Distance Sensor', category: 'sensor', componentId: 'sensor-distance', description: 'Front range finder for obstacle detection.', geometry: { shape: 'box', size: [0.03, 0.03, 0.06] }, color: '#22C55E', transform: { position: [0.215, 0.13, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } },
    { name: 'Controller Board', category: 'other', componentId: 'other-controller', description: 'Runs the robot program.', geometry: { shape: 'box', size: [0.07, 0.01, 0.05] }, color: '#0EA5E9', transform: { position: [-0.06, 0.183, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } },
  ],
};

const roboticArm: RobotTemplate = {
  id: 'robotic-arm',
  name: 'Robotic Arm',
  category: 'arm',
  summary: 'Three-joint articulated arm with a two-finger gripper.',
  highlights: ['3 revolute joints', '2 links', '1 gripper'],
  build: () => [
    { name: 'Base', category: 'body', componentId: 'body-cylinder', description: 'Fixed arm base.', geometry: { shape: 'cylinder', radius: 0.14, height: 0.08 }, color: '#475569', transform: { position: [0, 0.04, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } },
    { name: 'Shoulder Joint', category: 'joint', componentId: 'joint-revolute', description: 'Base rotation and shoulder pitch.', geometry: { shape: 'sphere', radius: 0.06 }, color: '#A855F7', transform: { position: [0, 0.13, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } },
    { name: 'Upper Arm', category: 'body', componentId: 'body-box', description: 'First link.', geometry: { shape: 'box', size: [0.07, 0.36, 0.07] }, color: '#3B82F6', transform: { position: [0, 0.32, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } },
    { name: 'Elbow Joint', category: 'joint', componentId: 'joint-revolute', description: 'Elbow pitch.', geometry: { shape: 'sphere', radius: 0.05 }, color: '#A855F7', transform: { position: [0, 0.51, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } },
    { name: 'Forearm', category: 'body', componentId: 'body-box', description: 'Second link.', geometry: { shape: 'box', size: [0.3, 0.06, 0.06] }, color: '#3B82F6', transform: { position: [0.15, 0.51, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } },
    { name: 'Wrist Joint', category: 'joint', componentId: 'joint-revolute', description: 'Wrist pitch.', geometry: { shape: 'sphere', radius: 0.04 }, color: '#A855F7', transform: { position: [0.31, 0.51, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } },
    { name: 'Gripper', category: 'other', componentId: 'other-gripper', description: 'Two-finger end effector.', geometry: { shape: 'box', size: [0.05, 0.1, 0.04] }, color: '#E2E8F0', transform: { position: [0.31, 0.43, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } },
  ],
};

const humanoid: RobotTemplate = {
  id: 'humanoid',
  name: 'Humanoid Robot',
  category: 'humanoid',
  summary: 'Upright two-legged frame with torso, arms and head.',
  highlights: ['Torso + head', '2 arms', '2 legs'],
  build: () => [
    { name: 'Torso', category: 'body', componentId: 'body-box', description: 'Upper body.', geometry: { shape: 'box', size: [0.32, 0.42, 0.18] }, color: '#3B82F6', transform: { position: [0, 1.1, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } },
    { name: 'Head', category: 'body', componentId: 'body-sphere', description: 'Holds the camera.', geometry: { shape: 'sphere', radius: 0.11 }, color: '#CBD5E1', transform: { position: [0, 1.45, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } },
    { name: 'Head Camera', category: 'sensor', componentId: 'sensor-camera', description: 'Vision sensor.', geometry: { shape: 'box', size: [0.03, 0.03, 0.06] }, color: '#10B981', transform: { position: [0, 1.46, 0.1], rotation: [0, 0, 0], scale: [1, 1, 1] } },
    { name: 'Pelvis', category: 'body', componentId: 'body-box', description: 'Hip block.', geometry: { shape: 'box', size: [0.28, 0.12, 0.16] }, color: '#334155', transform: { position: [0, 0.82, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } },
    { name: 'Left Arm', category: 'body', componentId: null, description: 'Left arm link.', geometry: { shape: 'capsule', radius: 0.045, length: 0.45 }, color: '#64748B', transform: { position: [0.22, 1.05, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } },
    { name: 'Right Arm', category: 'body', componentId: null, description: 'Right arm link.', geometry: { shape: 'capsule', radius: 0.045, length: 0.45 }, color: '#64748B', transform: { position: [-0.22, 1.05, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } },
    { name: 'Left Leg', category: 'body', componentId: null, description: 'Left leg link.', geometry: { shape: 'capsule', radius: 0.06, length: 0.6 }, color: '#64748B', transform: { position: [0.08, 0.42, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } },
    { name: 'Right Leg', category: 'body', componentId: null, description: 'Right leg link.', geometry: { shape: 'capsule', radius: 0.06, length: 0.6 }, color: '#64748B', transform: { position: [-0.08, 0.42, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } },
    { name: 'Left Foot', category: 'body', componentId: 'body-box', description: 'Contact pad.', geometry: { shape: 'box', size: [0.1, 0.04, 0.2] }, color: '#2F3A4C', transform: { position: [0.08, 0.02, 0.03], rotation: [0, 0, 0], scale: [1, 1, 1] } },
    { name: 'Right Foot', category: 'body', componentId: 'body-box', description: 'Contact pad.', geometry: { shape: 'box', size: [0.1, 0.04, 0.2] }, color: '#2F3A4C', transform: { position: [-0.08, 0.02, 0.03], rotation: [0, 0, 0], scale: [1, 1, 1] } },
  ],
};

const quadcopter: RobotTemplate = {
  id: 'quadcopter',
  name: 'Quadcopter Drone',
  category: 'drone',
  summary: 'X-frame quadcopter with four motors and propellers.',
  highlights: ['4 motors', '4 propellers', 'IMU'],
  build: () => {
    const arms: SceneObjectDraft[] = [Math.PI / 4, -Math.PI / 4].map((angle, i) => ({
      name: i === 0 ? 'Arm A' : 'Arm B',
      category: 'body',
      componentId: 'body-box',
      description: 'Frame arm.',
      geometry: { shape: 'box', size: [0.5, 0.02, 0.03] },
      color: '#334155',
      transform: { position: [0, 0.08, 0], rotation: [0, angle, 0], scale: [1, 1, 1] },
    }));
    const d = 0.25 / Math.SQRT2 * 1.0;
    const corners: [string, number, number][] = [
      ['Front Left', d, d],
      ['Front Right', d, -d],
      ['Rear Left', -d, d],
      ['Rear Right', -d, -d],
    ];
    const motorsAndProps: SceneObjectDraft[] = corners.flatMap(([label, x, z]) => [
      { name: `${label} Motor`, category: 'motor', componentId: 'motor-dc', description: 'Brushless motor.', geometry: { shape: 'cylinder', radius: 0.022, height: 0.03 }, color: '#F59E0B', transform: { position: [x, 0.105, z], rotation: [0, 0, 0], scale: [1, 1, 1] } },
      { name: `${label} Propeller`, category: 'other', componentId: null, description: 'Propeller disc.', geometry: { shape: 'cylinder', radius: 0.11, height: 0.004 }, color: '#94A3B8', transform: { position: [x, 0.125, z], rotation: [0, 0, 0], scale: [1, 1, 1] } },
    ]);
    return [
      { name: 'Body', category: 'body', componentId: 'body-box', description: 'Flight controller housing.', geometry: { shape: 'box', size: [0.14, 0.05, 0.14] }, color: '#3B82F6', transform: { position: [0, 0.08, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } },
      ...arms,
      ...motorsAndProps,
      { name: 'IMU', category: 'sensor', componentId: 'sensor-imu', description: 'Attitude sensor.', geometry: { shape: 'box', size: [0.025, 0.006, 0.025] }, color: '#14B8A6', transform: { position: [0, 0.108, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } },
      { name: 'Landing Skid Left', category: 'body', componentId: null, description: 'Landing gear.', geometry: { shape: 'box', size: [0.2, 0.012, 0.012] }, color: '#2F3A4C', transform: { position: [0, 0.006, 0.06], rotation: [0, 0, 0], scale: [1, 1, 1] } },
      { name: 'Landing Skid Right', category: 'body', componentId: null, description: 'Landing gear.', geometry: { shape: 'box', size: [0.2, 0.012, 0.012] }, color: '#2F3A4C', transform: { position: [0, 0.006, -0.06], rotation: [0, 0, 0], scale: [1, 1, 1] } },
      { name: 'Leg Front', category: 'body', componentId: null, description: 'Landing leg.', geometry: { shape: 'box', size: [0.012, 0.05, 0.13] }, color: '#2F3A4C', transform: { position: [0.06, 0.03, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } },
      { name: 'Leg Rear', category: 'body', componentId: null, description: 'Landing leg.', geometry: { shape: 'box', size: [0.012, 0.05, 0.13] }, color: '#2F3A4C', transform: { position: [-0.06, 0.03, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } },
    ];
  },
};

/** Featured templates (shown on the dashboard). Clearly sample data, not saved projects. */
export const FEATURED_TEMPLATES: readonly RobotTemplate[] = [explorerBot, roboticArm, humanoid, quadcopter];

export const ALL_TEMPLATES: readonly RobotTemplate[] = [...FEATURED_TEMPLATES, blank];

export function findTemplate(id: string): RobotTemplate | undefined {
  return ALL_TEMPLATES.find((t) => t.id === id);
}

/** Templates usable for a category: its own templates plus the blank starter. */
export function templatesForCategory(category: RobotCategory): RobotTemplate[] {
  return [...FEATURED_TEMPLATES.filter((t) => t.category === category), blank];
}

export function categoryLabel(category: RobotCategory): string {
  return ROBOT_CATEGORIES.find((c) => c.id === category)?.label ?? category;
}
