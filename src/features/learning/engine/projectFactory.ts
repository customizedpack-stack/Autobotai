/**
 * Safe project creation for the library: always a NEW project, made by the existing
 * projectStore.createProject from an existing template. Optional setup reuses the
 * existing builders (camera, actuators, programs, environments). Nothing existing is
 * ever overwritten.
 */
import { findComponent } from '../../component-library/catalog';
import { useProgramStore } from '../../code-studio/storage/programStore';
import { materializeObject } from '../../projects/materialize';
import { buildActuator } from '../../robot-model/actuators';
import { cameraMountSpot } from '../../robot-model/cameraPlacement';
import { findTemplate } from '../../robot-library/templates';
import { defaultCamera, uniqueSensorId, validateSensor } from '../../sensors/config/sensorConfig';
import { useProjectStore } from '../../../stores/projectStore';
import type { RobotProject } from '../../../types/project';
import type { RobotSensor } from '../../../types/sensor';
import type { SceneObject } from '../../../types/scene';
import type { RobotActuator } from '../../../types/actuator';
import { log } from '../../../utils/logger';
import type { ProjectDefinition } from '../model/types';
import { useLearningStore, type OriginKind } from '../store/learningStore';

export interface CreateOptions {
  kind: OriginKind;
  name?: string;
  /** Apply camera, actuators, environment and starter program (a ready, "completed" robot). */
  complete: boolean;
}

export type CreateResult = { ok: true; project: RobotProject; notes: string[] } | { ok: false; error: string };

/** Add a front camera exactly as Build → Inspector → Sensors → Camera does, but on a stored model. */
export function withCamera(model: { objects: SceneObject[]; controllers: RobotProject['controllers']; sensors: RobotSensor[]; joints: RobotProject['joints'] }): { objects: SceneObject[]; sensors: RobotSensor[] } | { error: string } {
  if (model.sensors.some((s) => s.type === 'camera')) return { objects: model.objects, sensors: model.sensors };
  const spot = cameraMountSpot(model.objects, model.controllers);
  const definition = findComponent('sensor-camera');
  if (!spot || !definition) return { error: 'There is no robot part to mount a camera on.' };
  const part: SceneObject = {
    ...materializeObject({ name: 'Front Camera', category: 'sensor', componentId: definition.id, description: definition.description, geometry: definition.geometry, color: definition.color, transform: { position: spot.position, rotation: [0, 0, 0], scale: [1, 1, 1] } }),
    parentId: spot.parentId,
  };
  const objects = [...model.objects, part];
  const camera = defaultCamera(part.id, uniqueSensorId('front-camera', model.sensors), 'Front Camera');
  const errors = validateSensor(camera, { ...model, objects }, model.sensors);
  if (errors.length) return { error: errors.join(' ') };
  return { objects, sensors: [...model.sensors, camera] };
}

/** A generic position actuator on every revolute joint that has none (Robotic Arm). */
export function withJointActuators(project: Pick<RobotProject, 'joints' | 'actuators'>): RobotActuator[] {
  const added = project.joints
    .filter((j) => j.type === 'revolute' && !project.actuators.some((a) => a.jointId === j.id))
    .map((j) => buildActuator({ type: 'jointActuator', jointId: j.id, name: `${j.name} Actuator` }, j));
  return [...project.actuators, ...added];
}

export function createFromDefinition(def: ProjectDefinition, options: CreateOptions): CreateResult {
  const template = findTemplate(def.templateId);
  if (!template) return { ok: false, error: `The template "${def.templateId}" does not exist.` };
  const store = useProjectStore.getState();
  const name = (options.name ?? (options.kind === 'example' ? `${def.name} (example)` : def.name)).trim().slice(0, 60);
  let project = store.createProject({ name, category: template.category, templateId: template.id });
  const notes: string[] = [];

  if (options.complete) {
    let objects = project.objects;
    let sensors = project.sensors ?? [];
    let actuators = project.actuators;
    if (def.setup.camera) {
      const result = withCamera({ objects, controllers: project.controllers, sensors, joints: project.joints });
      if ('error' in result) notes.push(`Camera not added: ${result.error}`);
      else ({ objects, sensors } = result);
    }
    if (def.setup.jointActuators) actuators = withJointActuators(project);
    if (objects !== project.objects || sensors !== (project.sensors ?? []) || actuators !== project.actuators) {
      project = store.saveProject(project.id, { name: project.name, objects, joints: project.joints, actuators, controllers: project.controllers, sensors }) ?? project;
    }
    if (def.setup.environmentId) store.setProjectEnvironment(project.id, def.setup.environmentId);
    if (def.setup.program) {
      const created = useProgramStore.getState().createProgram({ projectId: project.id, language: 'javascript', name: def.setup.program.name, description: def.setup.program.description, source: def.setup.program.source });
      if (!created.ok) notes.push(`Starter program not added: ${created.error}`);
      else useProgramStore.getState().setLastOpened(project.id, created.program.id);
    }
  }

  useLearningStore.getState().setOrigin(project.id, { definitionId: def.id, definitionVersion: def.version, kind: options.kind, createdAt: new Date().toISOString() });
  log.info('project', `Created "${project.name}" from the ${def.name} learning project${options.complete ? ' (ready to run)' : ''}.`);
  return { ok: true, project: useProjectStore.getState().projects[project.id] ?? project, notes };
}

export { projectsFromDefinition } from './origins';
