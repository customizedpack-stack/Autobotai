import type { RobotCategory } from '../../types/project';
import type { JointDraft } from '../../types/joint';
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
  /**
   * Builds the placeholder components. Draft transforms are WORLD transforms;
   * `key` / `parentKey` describe the component hierarchy.
   */
  build: () => SceneObjectDraft[];
  /** Joints between template components, referring to draft keys. */
  joints?: () => JointDraft[];
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
    { name: 'Chassis', key: 'chassis', category: 'chassis', componentId: 'chassis-rect', description: 'Main frame of Explorer Bot.', geometry: { shape: 'box', size: [0.4, 0.1, 0.26] }, color: '#3B82F6', transform: { position: [0, 0.11, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } },
    { name: 'Top Plate', key: 'plate', parentKey: 'chassis', category: 'body', componentId: 'body-plate', description: 'Mounting deck.', geometry: { shape: 'box', size: [0.34, 0.015, 0.22] }, color: '#334155', transform: { position: [-0.02, 0.17, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } },
    { name: 'Left Wheel', key: 'lwheel', parentKey: 'chassis', category: 'wheel', componentId: 'wheel-standard', description: 'Left drive wheel.', geometry: { shape: 'cylinder', radius: 0.07, height: 0.035 }, color: '#2F3A4C', transform: { position: [0.06, 0.07, 0.155], rotation: [HALF_PI, 0, 0], scale: [1, 1, 1] } },
    { name: 'Right Wheel', key: 'rwheel', parentKey: 'chassis', category: 'wheel', componentId: 'wheel-standard', description: 'Right drive wheel.', geometry: { shape: 'cylinder', radius: 0.07, height: 0.035 }, color: '#2F3A4C', transform: { position: [0.06, 0.07, -0.155], rotation: [HALF_PI, 0, 0], scale: [1, 1, 1] } },
    { name: 'Left Motor', key: 'lmotor', parentKey: 'chassis', category: 'motor', componentId: 'motor-dc', description: 'Drives the left wheel.', geometry: { shape: 'cylinder', radius: 0.02, height: 0.07 }, color: '#F59E0B', transform: { position: [0.06, 0.07, 0.09], rotation: [HALF_PI, 0, 0], scale: [1, 1, 1] } },
    { name: 'Right Motor', key: 'rmotor', parentKey: 'chassis', category: 'motor', componentId: 'motor-dc', description: 'Drives the right wheel.', geometry: { shape: 'cylinder', radius: 0.02, height: 0.07 }, color: '#F59E0B', transform: { position: [0.06, 0.07, -0.09], rotation: [HALF_PI, 0, 0], scale: [1, 1, 1] } },
    { name: 'Caster Ball', key: 'caster', parentKey: 'chassis', category: 'wheel', componentId: 'wheel-caster', description: 'Rear support.', geometry: { shape: 'sphere', radius: 0.03 }, color: '#94A3B8', transform: { position: [-0.15, 0.03, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } },
    { name: 'Distance Sensor', key: 'sensor', parentKey: 'chassis', category: 'sensor', componentId: 'sensor-distance', description: 'Front range finder for obstacle detection.', geometry: { shape: 'box', size: [0.03, 0.03, 0.06] }, color: '#22C55E', transform: { position: [0.215, 0.13, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } },
    { name: 'Controller Board', key: 'controller', parentKey: 'plate', category: 'other', componentId: 'other-controller', description: 'Runs the robot program.', geometry: { shape: 'box', size: [0.07, 0.01, 0.05] }, color: '#0EA5E9', transform: { position: [-0.06, 0.183, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } },
  ],
  joints: () => [
    { name: 'Left Wheel Joint', type: 'revolute', parentKey: 'chassis', childKey: 'lwheel', axis: [0, 0, 1], limits: { lower: -Math.PI, upper: Math.PI }, description: 'Wheel axle. Continuous drive arrives with motor control in Phase 3.' },
    { name: 'Right Wheel Joint', type: 'revolute', parentKey: 'chassis', childKey: 'rwheel', axis: [0, 0, 1], limits: { lower: -Math.PI, upper: Math.PI }, description: 'Wheel axle. Continuous drive arrives with motor control in Phase 3.' },
    { name: 'Sensor Mount', type: 'fixed', parentKey: 'chassis', childKey: 'sensor', axis: [0, 0, 1] },
  ],
};

const roboticArm: RobotTemplate = {
  id: 'robotic-arm',
  name: 'Robotic Arm',
  category: 'arm',
  summary: 'Three-joint articulated arm with a two-finger gripper.',
  highlights: ['3 revolute joints', '2 links', '1 gripper'],
  build: () => [
    { name: 'Base', key: 'base', category: 'body', componentId: 'body-cylinder', description: 'Fixed arm base.', geometry: { shape: 'cylinder', radius: 0.14, height: 0.08 }, color: '#475569', transform: { position: [0, 0.04, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } },
    { name: 'Shoulder Joint', key: 'shoulderMarker', parentKey: 'base', category: 'joint', componentId: 'joint-revolute', description: 'Base rotation and shoulder pitch.', geometry: { shape: 'sphere', radius: 0.06 }, color: '#A855F7', transform: { position: [0, 0.13, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } },
    { name: 'Upper Arm', key: 'upper', parentKey: 'base', category: 'body', componentId: 'body-box', description: 'First link.', geometry: { shape: 'box', size: [0.07, 0.36, 0.07] }, color: '#3B82F6', transform: { position: [0, 0.32, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } },
    { name: 'Elbow Joint', key: 'elbowMarker', parentKey: 'upper', category: 'joint', componentId: 'joint-revolute', description: 'Elbow pitch.', geometry: { shape: 'sphere', radius: 0.05 }, color: '#A855F7', transform: { position: [0, 0.51, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } },
    { name: 'Forearm', key: 'fore', parentKey: 'upper', category: 'body', componentId: 'body-box', description: 'Second link.', geometry: { shape: 'box', size: [0.3, 0.06, 0.06] }, color: '#3B82F6', transform: { position: [0.15, 0.51, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } },
    { name: 'Wrist Joint', key: 'wristMarker', parentKey: 'fore', category: 'joint', componentId: 'joint-revolute', description: 'Wrist pitch.', geometry: { shape: 'sphere', radius: 0.04 }, color: '#A855F7', transform: { position: [0.31, 0.51, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } },
    { name: 'Gripper', key: 'grip', parentKey: 'fore', category: 'other', componentId: 'other-gripper', description: 'Two-finger end effector.', geometry: { shape: 'box', size: [0.05, 0.1, 0.04] }, color: '#E2E8F0', transform: { position: [0.31, 0.43, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } },
  ],
  joints: () => [
    { name: 'Shoulder', type: 'revolute', parentKey: 'base', childKey: 'upper', axis: [0, 0, 1], originWorld: [0, 0.13, 0], limits: { lower: -90 * Math.PI / 180, upper: 90 * Math.PI / 180 } },
    { name: 'Elbow', type: 'revolute', parentKey: 'upper', childKey: 'fore', axis: [0, 0, 1], originWorld: [0, 0.51, 0], limits: { lower: -135 * Math.PI / 180, upper: 135 * Math.PI / 180 } },
    { name: 'Wrist', type: 'revolute', parentKey: 'fore', childKey: 'grip', axis: [0, 0, 1], originWorld: [0.31, 0.51, 0], limits: { lower: -90 * Math.PI / 180, upper: 90 * Math.PI / 180 } },
  ],
};

const humanoid: RobotTemplate = {
  id: 'humanoid',
  name: 'Humanoid Robot',
  category: 'humanoid',
  summary: 'Upright two-legged frame with torso, arms and head.',
  highlights: ['Torso + head', '2 arms', '2 legs'],
  build: () => [
    { name: 'Torso', key: 'torso', parentKey: 'pelvis', category: 'body', componentId: 'body-box', description: 'Upper body.', geometry: { shape: 'box', size: [0.32, 0.42, 0.18] }, color: '#3B82F6', transform: { position: [0, 1.1, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } },
    { name: 'Head', key: 'head', parentKey: 'torso', category: 'body', componentId: 'body-sphere', description: 'Holds the camera.', geometry: { shape: 'sphere', radius: 0.11 }, color: '#CBD5E1', transform: { position: [0, 1.45, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } },
    { name: 'Head Camera', key: 'camera', parentKey: 'head', category: 'sensor', componentId: 'sensor-camera', description: 'Vision sensor.', geometry: { shape: 'box', size: [0.03, 0.03, 0.06] }, color: '#10B981', transform: { position: [0, 1.46, 0.1], rotation: [0, 0, 0], scale: [1, 1, 1] } },
    { name: 'Pelvis', key: 'pelvis', category: 'body', componentId: 'body-box', description: 'Hip block.', geometry: { shape: 'box', size: [0.28, 0.12, 0.16] }, color: '#334155', transform: { position: [0, 0.82, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } },
    { name: 'Left Arm', key: 'larm', parentKey: 'torso', category: 'body', componentId: null, description: 'Left arm link.', geometry: { shape: 'capsule', radius: 0.045, length: 0.45 }, color: '#64748B', transform: { position: [0.22, 1.05, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } },
    { name: 'Right Arm', key: 'rarm', parentKey: 'torso', category: 'body', componentId: null, description: 'Right arm link.', geometry: { shape: 'capsule', radius: 0.045, length: 0.45 }, color: '#64748B', transform: { position: [-0.22, 1.05, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } },
    { name: 'Left Leg', key: 'lleg', parentKey: 'pelvis', category: 'body', componentId: null, description: 'Left leg link.', geometry: { shape: 'capsule', radius: 0.06, length: 0.6 }, color: '#64748B', transform: { position: [0.08, 0.42, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } },
    { name: 'Right Leg', key: 'rleg', parentKey: 'pelvis', category: 'body', componentId: null, description: 'Right leg link.', geometry: { shape: 'capsule', radius: 0.06, length: 0.6 }, color: '#64748B', transform: { position: [-0.08, 0.42, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } },
    { name: 'Left Foot', key: 'lfoot', parentKey: 'lleg', category: 'body', componentId: 'body-box', description: 'Contact pad.', geometry: { shape: 'box', size: [0.1, 0.04, 0.2] }, color: '#2F3A4C', transform: { position: [0.08, 0.02, 0.03], rotation: [0, 0, 0], scale: [1, 1, 1] } },
    { name: 'Right Foot', key: 'rfoot', parentKey: 'rleg', category: 'body', componentId: 'body-box', description: 'Contact pad.', geometry: { shape: 'box', size: [0.1, 0.04, 0.2] }, color: '#2F3A4C', transform: { position: [-0.08, 0.02, 0.03], rotation: [0, 0, 0], scale: [1, 1, 1] } },
  ],
  joints: () => [
    { name: 'Waist', type: 'fixed', parentKey: 'pelvis', childKey: 'torso', axis: [0, 1, 0] },
    { name: 'Neck', type: 'revolute', parentKey: 'torso', childKey: 'head', axis: [0, 1, 0], originWorld: [0, 1.33, 0], limits: { lower: -80 * Math.PI / 180, upper: 80 * Math.PI / 180 } },
    { name: 'Left Shoulder', type: 'revolute', parentKey: 'torso', childKey: 'larm', axis: [1, 0, 0], originWorld: [0.22, 1.27, 0], limits: { lower: -180 * Math.PI / 180, upper: 60 * Math.PI / 180 } },
    { name: 'Right Shoulder', type: 'revolute', parentKey: 'torso', childKey: 'rarm', axis: [1, 0, 0], originWorld: [-0.22, 1.27, 0], limits: { lower: -180 * Math.PI / 180, upper: 60 * Math.PI / 180 } },
    { name: 'Left Hip', type: 'revolute', parentKey: 'pelvis', childKey: 'lleg', axis: [1, 0, 0], originWorld: [0.08, 0.76, 0], limits: { lower: -90 * Math.PI / 180, upper: 45 * Math.PI / 180 } },
    { name: 'Right Hip', type: 'revolute', parentKey: 'pelvis', childKey: 'rleg', axis: [1, 0, 0], originWorld: [-0.08, 0.76, 0], limits: { lower: -90 * Math.PI / 180, upper: 45 * Math.PI / 180 } },
    { name: 'Left Ankle', type: 'revolute', parentKey: 'lleg', childKey: 'lfoot', axis: [1, 0, 0], originWorld: [0.08, 0.08, 0], limits: { lower: -30 * Math.PI / 180, upper: 30 * Math.PI / 180 } },
    { name: 'Right Ankle', type: 'revolute', parentKey: 'rleg', childKey: 'rfoot', axis: [1, 0, 0], originWorld: [-0.08, 0.08, 0], limits: { lower: -30 * Math.PI / 180, upper: 30 * Math.PI / 180 } },
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
      key: i === 0 ? 'armA' : 'armB',
      parentKey: 'body',
      category: 'body',
      componentId: 'body-box',
      description: 'Frame arm.',
      geometry: { shape: 'box', size: [0.5, 0.02, 0.03] },
      color: '#334155',
      transform: { position: [0, 0.08, 0], rotation: [0, angle, 0], scale: [1, 1, 1] },
    }));
    const d = 0.25 / Math.SQRT2;
    const corners: [string, number, number][] = [
      ['Front Left', d, d],
      ['Front Right', d, -d],
      ['Rear Left', -d, d],
      ['Rear Right', -d, -d],
    ];
    const motorsAndProps: SceneObjectDraft[] = corners.flatMap(([label, x, z]) => [
      { name: `${label} Motor`, key: `motor-${label}`, parentKey: 'body', category: 'motor', componentId: 'motor-dc', description: 'Brushless motor.', geometry: { shape: 'cylinder', radius: 0.022, height: 0.03 }, color: '#F59E0B', transform: { position: [x, 0.105, z], rotation: [0, 0, 0], scale: [1, 1, 1] } },
      { name: `${label} Propeller`, key: `prop-${label}`, parentKey: `motor-${label}`, category: 'other', componentId: null, description: 'Propeller disc.', geometry: { shape: 'cylinder', radius: 0.11, height: 0.004 }, color: '#94A3B8', transform: { position: [x, 0.125, z], rotation: [0, 0, 0], scale: [1, 1, 1] } },
    ]);
    return [
      { name: 'Body', key: 'body', category: 'body', componentId: 'body-box', description: 'Flight controller housing.', geometry: { shape: 'box', size: [0.14, 0.05, 0.14] }, color: '#3B82F6', transform: { position: [0, 0.08, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } },
      ...arms,
      ...motorsAndProps,
      { name: 'IMU', key: 'imu', parentKey: 'body', category: 'sensor', componentId: 'sensor-imu', description: 'Attitude sensor.', geometry: { shape: 'box', size: [0.025, 0.006, 0.025] }, color: '#14B8A6', transform: { position: [0, 0.108, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } },
      { name: 'Landing Skid Left', key: 'skidL', parentKey: 'body', category: 'body', componentId: null, description: 'Landing gear.', geometry: { shape: 'box', size: [0.2, 0.012, 0.012] }, color: '#2F3A4C', transform: { position: [0, 0.006, 0.06], rotation: [0, 0, 0], scale: [1, 1, 1] } },
      { name: 'Landing Skid Right', key: 'skidR', parentKey: 'body', category: 'body', componentId: null, description: 'Landing gear.', geometry: { shape: 'box', size: [0.2, 0.012, 0.012] }, color: '#2F3A4C', transform: { position: [0, 0.006, -0.06], rotation: [0, 0, 0], scale: [1, 1, 1] } },
      { name: 'Leg Front', key: 'legF', parentKey: 'body', category: 'body', componentId: null, description: 'Landing leg.', geometry: { shape: 'box', size: [0.012, 0.05, 0.13] }, color: '#2F3A4C', transform: { position: [0.06, 0.03, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } },
      { name: 'Leg Rear', key: 'legR', parentKey: 'body', category: 'body', componentId: null, description: 'Landing leg.', geometry: { shape: 'box', size: [0.012, 0.05, 0.13] }, color: '#2F3A4C', transform: { position: [-0.06, 0.03, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } },
    ];
  },
  joints: () =>
    ['Front Left', 'Front Right', 'Rear Left', 'Rear Right'].map((label) => ({
      name: `${label} Rotor`,
      type: 'revolute' as const,
      parentKey: `motor-${label}`,
      childKey: `prop-${label}`,
      axis: [0, 1, 0] as [number, number, number],
      limits: { lower: -Math.PI, upper: Math.PI },
      description: 'Propeller spin axis. Thrust arrives with drone dynamics in a later phase.',
    })),
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
