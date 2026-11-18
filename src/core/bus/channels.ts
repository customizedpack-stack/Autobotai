import type { LogInput } from '../../types/console';
import type { CameraView } from '../../types/viewport';

/**
 * Message map for the Connector Bus (the platform's "nervous system").
 *
 * Every module communicates through these typed channels instead of calling
 * other modules directly. Phase 1 only uses the editor channels below; the
 * master plan's connectors C1-C8 are listed in FUTURE_CONNECTORS so later
 * phases add their channels here without rewriting existing modules.
 */
export interface BusChannels {
  'console.log': LogInput;
  'project.created': { projectId: string; name: string };
  'project.opened': { projectId: string; name: string };
  'project.saved': { projectId: string; savedAt: string };
  'project.renamed': { projectId: string; name: string };
  'project.deleted': { projectId: string };
  'scene.changed': { reason: string; objectCount: number };
  'selection.changed': { objectId: string | null };
  'viewport.viewChanged': { view: CameraView };
}

export type BusChannel = keyof BusChannels;

export interface FutureConnector {
  code: string;
  name: string;
  carries: string;
  phase: string;
}

/** Connectors from the master build plan, not active yet in Phase 1. */
export const FUTURE_CONNECTORS: readonly FutureConnector[] = [
  { code: 'C1', name: 'Robot Model Connector', carries: 'Robot structure: parts, joints, motors, sensors', phase: 'Phase 2 / B' },
  { code: 'C2', name: 'Command Bus', carries: 'Movement commands: drive, turn, set joint, stop', phase: 'Phase 3 / D' },
  { code: 'C3', name: 'Sensor Stream', carries: 'Distance, IMU, camera and lidar readings', phase: 'Phase 6 / F' },
  { code: 'C4', name: 'Sim State Stream', carries: 'Pose of every part, each physics frame', phase: 'Phase 5 / E' },
  { code: 'C5', name: 'Environment Connector', carries: 'Floors, walls, obstacles, zones', phase: 'Phase 7 / I' },
  { code: 'C6', name: 'Project Storage Connector', carries: 'Cloud save, load and versions', phase: 'Phase 8 / H' },
  { code: 'C7', name: 'Telemetry and Log', carries: 'Logs, errors, scores, performance', phase: 'Active (local console)' },
  { code: 'C8', name: 'AI Connector', carries: 'AI requests, plans and generated code', phase: 'Phase J' },
];
