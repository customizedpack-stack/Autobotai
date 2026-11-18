import { PROJECT_SCHEMA_VERSION, type RobotCategory, type RobotProject } from '../../types/project';
import type { RobotActuator, RobotController } from '../../types/actuator';
import type { RobotJoint } from '../../types/joint';
import { suggestDifferentialDrive } from './drive';
import type { SceneObject } from '../../types/scene';
import { validateRobotModel } from './validation';

/**
 * Versioned robot configuration schema and migrations.
 *
 * v1 (Phase 1): flat list of objects with WORLD transforms, `parentId` always
 *               null, no joints.
 * v2 (Phase 2): component tree via `parentId`, LOCAL transforms, `joints[]`.
 *
 * v3 (Phase 3): `actuators[]` (motors bound to joints) and `controllers[]`
 *               (differential drive).
 *
 * Because every v1 object is a root, its world transform is also its local
 * transform, so v1 -> v2 keeps every transform unchanged and adds `joints: []`.
 * v2 -> v3 keeps components, transforms, hierarchy and joints unchanged and
 * adds `actuators: []` and `controllers: []`; Explorer Bot projects also get
 * their two DC motors and a differential-drive controller.
 * Migration never drops data: unknown fields are kept, missing fields get
 * safe defaults, and anything suspicious is reported as a warning.
 */

export interface MigrationResult {
  project: RobotProject;
  fromVersion: number;
  toVersion: number;
  warnings: string[];
}

const CATEGORIES: readonly RobotCategory[] = ['mobile', 'arm', 'humanoid', 'drone', 'industrial', 'quadruped'];

type Loose = Record<string, unknown>;
const isObject = (v: unknown): v is Loose => typeof v === 'object' && v !== null && !Array.isArray(v);
const vec3 = (v: unknown, fallback: [number, number, number]): [number, number, number] =>
  Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n))
    ? [v[0] as number, v[1] as number, v[2] as number]
    : fallback;

function normalizeObject(raw: Loose, index: number, warnings: string[]): SceneObject {
  const transform = isObject(raw.transform) ? raw.transform : {};
  const metadata = isObject(raw.metadata) ? raw.metadata : {};
  const id = typeof raw.id === 'string' && raw.id ? raw.id : `obj_migrated_${index}`;
  if (id !== raw.id) warnings.push(`Object #${index + 1} had no id; assigned ${id}.`);
  const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name : `Object ${index + 1}`;
  const fallbackScale: [number, number, number] = [1, 1, 1];
  if (!isObject(raw.transform)) warnings.push(`"${name}" had no transform; reset to the origin.`);
  return {
    ...(raw as object),
    id,
    name,
    category: (raw.category as SceneObject['category']) ?? 'other',
    geometry: (raw.geometry as SceneObject['geometry']) ?? { shape: 'box', size: [0.1, 0.1, 0.1] },
    color: typeof raw.color === 'string' ? raw.color : '#64748B',
    transform: {
      position: vec3(transform.position, [0, 0, 0]),
      rotation: vec3(transform.rotation, [0, 0, 0]),
      scale: vec3(transform.scale, fallbackScale),
    },
    visible: raw.visible !== false,
    parentId: typeof raw.parentId === 'string' ? raw.parentId : null,
    metadata: {
      ...(metadata as object),
      componentId: typeof metadata.componentId === 'string' ? metadata.componentId : null,
      description: typeof metadata.description === 'string' ? metadata.description : '',
      createdAt: typeof metadata.createdAt === 'string' ? metadata.createdAt : new Date(0).toISOString(),
    },
  } as SceneObject;
}

/** v1 -> v2. Pure; returns a new object. */
function migrateV1toV2(raw: Loose, warnings: string[]): Loose {
  const objects = Array.isArray(raw.objects) ? raw.objects : [];
  if (!Array.isArray(raw.objects)) warnings.push('Project had no object list; started with an empty one.');
  const normalized = objects.filter(isObject).map((o, i) => normalizeObject(o, i, warnings));
  if (normalized.length !== objects.length) warnings.push(`${objects.length - normalized.length} unreadable object entries were skipped.`);
  return { ...raw, objects: normalized, joints: [], schemaVersion: 2 };
}

/** Drive setup for a model that has two wheel joints and motors; empty when none can be detected. */
export function autoConfigureDrive(
  objects: readonly import('../../types/scene').SceneObject[],
  joints: readonly RobotJoint[],
): { actuators: RobotActuator[]; controllers: RobotController[] } {
  const suggestion = suggestDifferentialDrive(objects, joints, []);
  return suggestion.ok ? { actuators: suggestion.actuators, controllers: [suggestion.controller] } : { actuators: [], controllers: [] };
}

/** v2 -> v3. Pure; returns a new object. */
function migrateV2toV3(raw: Loose, warnings: string[]): Loose {
  const objects = (Array.isArray(raw.objects) ? raw.objects : []).filter(isObject).map((o, i) => normalizeObject(o, i, warnings));
  const joints = (Array.isArray(raw.joints) ? raw.joints : []).filter(isObject) as unknown as RobotJoint[];
  let drive = { actuators: [] as RobotActuator[], controllers: [] as RobotController[] };
  if (raw.templateId === 'explorer-bot') {
    drive = autoConfigureDrive(objects, joints);
    if (drive.controllers.length === 0) warnings.push('Explorer Bot drive could not be configured automatically; use "Set up differential drive".');
  }
  return { ...raw, actuators: drive.actuators, controllers: drive.controllers, schemaVersion: 3 };
}

/** Migrate any stored project to the current schema. Throws only if `raw` is not an object. */
export function migrateProject(raw: unknown): MigrationResult {
  if (!isObject(raw)) throw new Error('Project data is not an object.');
  const warnings: string[] = [];
  const fromVersion = typeof raw.schemaVersion === 'number' ? raw.schemaVersion : 1;
  let data: Loose = { ...raw };

  if (fromVersion > PROJECT_SCHEMA_VERSION) {
    warnings.push(`Project uses newer schema v${fromVersion}; loaded as-is.`);
  }
  if (fromVersion < 2) data = migrateV1toV2(data, warnings);
  if (fromVersion < 3) data = migrateV2toV3(data, warnings);

  const objects = (Array.isArray(data.objects) ? data.objects : []).filter(isObject).map((o, i) => normalizeObject(o, i, warnings));
  const joints = (Array.isArray(data.joints) ? data.joints : []).filter(isObject) as unknown as RobotJoint[];
  const actuators = (Array.isArray(data.actuators) ? data.actuators : []).filter(isObject) as unknown as RobotActuator[];
  const controllers = (Array.isArray(data.controllers) ? data.controllers : []).filter(isObject) as unknown as RobotController[];
  const now = new Date().toISOString();
  const project: RobotProject = {
    ...(data as object),
    id: typeof data.id === 'string' ? data.id : `prj_migrated_${Date.now()}`,
    name: typeof data.name === 'string' && data.name.trim() ? data.name : 'Untitled Robot',
    category: CATEGORIES.includes(data.category as RobotCategory) ? (data.category as RobotCategory) : 'mobile',
    templateId: typeof data.templateId === 'string' ? data.templateId : 'blank',
    schemaVersion: Math.max(fromVersion, PROJECT_SCHEMA_VERSION),
    objects,
    joints,
    actuators,
    controllers,
    createdAt: typeof data.createdAt === 'string' ? data.createdAt : now,
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : now,
    savedAt: typeof data.savedAt === 'string' ? data.savedAt : null,
  } as RobotProject;

  // Invalid actuators are kept (never dropped) but disabled, so they cannot drive anything.
  const issues = validateRobotModel(project.objects, project.joints, project.actuators, project.controllers);
  const ids = new Set(project.objects.map((o) => o.id));
  const jointIds = new Set(project.joints.map((j) => j.id));
  project.actuators = project.actuators.map((a) =>
    a.enabled && (!jointIds.has(a.jointId) || (a.componentId !== null && !ids.has(a.componentId))) ? { ...a, enabled: false } : a,
  );
  for (const issue of issues) warnings.push(issue.message);
  return { project, fromVersion, toVersion: project.schemaVersion, warnings };
}
