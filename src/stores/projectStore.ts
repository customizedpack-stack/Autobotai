import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { bus } from '../core/bus/connectorBus';
import { materializeTemplate } from '../features/projects/materialize';
import { autoConfigureDrive, migrateProject } from '../features/robot-model/schema';
import { findTemplate } from '../features/robot-library/templates';
import { PROJECT_SCHEMA_VERSION, type NewProjectInput, type RobotProject } from '../types/project';
import type { RobotActuator, RobotController } from '../types/actuator';
import type { RobotJoint } from '../types/joint';
import type { SceneObject } from '../types/scene';
import type { RobotSensor } from '../types/sensor';
import { defaultSensorsFor } from '../features/sensors/config/sensorConfig';
import { createId } from '../utils/id';
import { log } from '../utils/logger';
import { safeStorage } from '../utils/storage';

/**
 * Local project drafts, kept in this browser only.
 * Cloud persistence replaces this storage in Phase 8 via the Project Storage Connector (C6).
 */
interface ProjectState {
  projects: Record<string, RobotProject>;
  createProject: (input: NewProjectInput) => RobotProject;
  saveProject: (
    id: string,
    data: { name: string; objects: SceneObject[]; joints: RobotJoint[]; actuators: RobotActuator[]; controllers: RobotController[]; sensors?: RobotSensor[] },
  ) => RobotProject | null;
  renameProject: (id: string, name: string) => void;
  /** Phase 7: remember the environment this project simulates in (not part of the robot undo history). */
  setProjectEnvironment: (id: string, environmentId: string) => void;
  deleteProject: (id: string) => void;
  getProject: (id: string) => RobotProject | undefined;
}

export const useProjectStore = create<ProjectState>()(
  persist(
    (set, get) => ({
      projects: {},

      createProject: (input) => {
        const now = new Date().toISOString();
        const template = findTemplate(input.templateId) ?? findTemplate('blank');
        const { objects, joints } = template
          ? materializeTemplate(template.build(), template.joints?.() ?? [], now)
          : { objects: [], joints: [] };
        // Explorer Bot comes ready to drive: two DC motors and a differential-drive controller.
        const drive = template?.id === 'explorer-bot' ? autoConfigureDrive(objects, joints) : { actuators: [], controllers: [] };
        const project: RobotProject = {
          id: createId('prj'),
          name: input.name.trim() || 'Untitled Robot',
          category: input.category,
          templateId: template?.id ?? 'blank',
          schemaVersion: PROJECT_SCHEMA_VERSION,
          objects,
          joints,
          actuators: drive.actuators,
          controllers: drive.controllers,
          // Phase 6: Explorer Bot comes with its standard sensors (distance, two encoders, IMU).
          ...(template?.id === 'explorer-bot' ? { sensors: defaultSensorsFor({ objects, joints, controllers: drive.controllers }) } : {}),
          createdAt: now,
          updatedAt: now,
          savedAt: now,
        };
        set((state) => ({ projects: { ...state.projects, [project.id]: project } }));
        bus.publish('project.created', { projectId: project.id, name: project.name });
        log.success('project', `Created project "${project.name}" from template "${template?.name ?? 'Blank'}".`);
        return project;
      },

      saveProject: (id, data) => {
        const existing = get().projects[id];
        if (!existing) return null;
        const now = new Date().toISOString();
        const updated: RobotProject = {
          ...existing,
          name: data.name.trim() || existing.name,
          objects: structuredClone(data.objects),
          joints: structuredClone(data.joints),
          actuators: structuredClone(data.actuators),
          controllers: structuredClone(data.controllers),
          // Projects that never had sensors keep having no sensor field.
          ...(data.sensors && (data.sensors.length > 0 || existing.sensors) ? { sensors: structuredClone(data.sensors) } : {}),
          schemaVersion: PROJECT_SCHEMA_VERSION,
          updatedAt: now,
          savedAt: now,
        };
        set((state) => ({ projects: { ...state.projects, [id]: updated } }));
        bus.publish('project.saved', { projectId: id, savedAt: now });
        return updated;
      },

      renameProject: (id, name) => {
        const existing = get().projects[id];
        const trimmed = name.trim();
        if (!existing || !trimmed) return;
        set((state) => ({
          projects: { ...state.projects, [id]: { ...existing, name: trimmed, updatedAt: new Date().toISOString() } },
        }));
        bus.publish('project.renamed', { projectId: id, name: trimmed });
      },

      deleteProject: (id) => {
        const existing = get().projects[id];
        if (!existing) return;
        set((state) => {
          const next = { ...state.projects };
          delete next[id];
          return { projects: next };
        });
        bus.publish('project.deleted', { projectId: id });
        log.warning('project', `Deleted project "${existing.name}".`);
      },

      setProjectEnvironment: (id, environmentId) => {
        const existing = get().projects[id];
        if (!existing || existing.environmentId === environmentId) return;
        set((state) => ({ projects: { ...state.projects, [id]: { ...existing, environmentId } } }));
      },

      getProject: (id) => get().projects[id],
    }),
    {
      // The storage key keeps its original name so existing drafts are found.
      name: 'arai.projects.v1',
      storage: safeStorage,
      version: 3,
      // The persisted store version follows the schema version; upgrade each project in place.
      migrate: (persisted, version) => migratePersistedProjects(persisted, version),
    },
  ),
);

/** Upgrade every stored project to the current schema. Nothing is dropped silently. */
export function migratePersistedProjects(persisted: unknown, version: number): { projects: Record<string, RobotProject> } {
  const state = (persisted ?? {}) as { projects?: Record<string, unknown> };
  const projects: Record<string, RobotProject> = {};
  let migrated = 0;
  for (const [key, raw] of Object.entries(state.projects ?? {})) {
    try {
      const result = migrateProject(raw);
      projects[result.project.id ?? key] = result.project;
      if (result.fromVersion < result.toVersion) migrated += 1;
      for (const warning of result.warnings) log.warning('storage', `Migration of "${result.project.name}": ${warning}`);
    } catch (error) {
      // Keep the unreadable data in a separate key so it is never lost.
      try {
        const backup = JSON.parse(window.localStorage.getItem('arai.projects.unreadable') ?? '{}') as Record<string, unknown>;
        backup[key] = raw;
        window.localStorage.setItem('arai.projects.unreadable', JSON.stringify(backup));
      } catch {
        /* storage unavailable */
      }
      log.error('storage', `Could not read stored project "${key}": ${String(error)}. A copy was kept in "arai.projects.unreadable".`);
    }
  }
  if (migrated > 0) log.info('storage', `Upgraded ${migrated} project(s) from schema v${version} to v${PROJECT_SCHEMA_VERSION}.`);
  return { projects };
}

/** Projects sorted by most recently updated. */
export function selectRecentProjects(state: ProjectState): RobotProject[] {
  return Object.values(state.projects).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
