import type { RobotActuator, RobotController } from './actuator';
import type { RobotJoint } from './joint';
import type { SceneObject } from './scene';
import type { RobotSensor } from './sensor';
import type { Blueprint } from '../features/blueprint/model/types';

export type RobotCategory = 'mobile' | 'arm' | 'humanoid' | 'drone' | 'industrial' | 'quadruped';

/**
 * Robot configuration schema version.
 * v1 (Phase 1): flat objects, world transforms, no joints.
 * v2 (Phase 2): component hierarchy with local transforms, and joints.
 * v3 (Phase 3): actuators bound to joints, and controllers (differential drive).
 */
export const PROJECT_SCHEMA_VERSION = 3;

export interface RobotProject {
  id: string;
  name: string;
  category: RobotCategory;
  templateId: string;
  schemaVersion: number;
  objects: SceneObject[];
  joints: RobotJoint[];
  actuators: RobotActuator[];
  controllers: RobotController[];
  /** Phase 6: sensor configurations (optional; projects without sensors have no field). */
  sensors?: RobotSensor[];
  /** Phase 7: the environment (template or saved environment id) this project simulates in. Optional. */
  environmentId?: string;
  /** Phase 9: Robot Blueprint (real parts, wiring, BOM, guide, history). Optional; validated on load. */
  blueprint?: Blueprint;
  createdAt: string;
  updatedAt: string;
  /** Last time the draft was explicitly saved in this browser. */
  savedAt: string | null;
}

export interface NewProjectInput {
  name: string;
  category: RobotCategory;
  templateId: string;
}
