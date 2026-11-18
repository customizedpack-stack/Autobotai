import type { SceneObject } from './scene';

export type RobotCategory = 'mobile' | 'arm' | 'humanoid' | 'drone' | 'industrial' | 'quadruped';

export const PROJECT_SCHEMA_VERSION = 1;

export interface RobotProject {
  id: string;
  name: string;
  category: RobotCategory;
  templateId: string;
  schemaVersion: number;
  objects: SceneObject[];
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
