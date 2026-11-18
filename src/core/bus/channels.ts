import type { CommandSource, CommandType, RobotCommand } from '../../features/controls/commands';
import type { CommandStatus } from '../../features/controls/movementEngine';
import type { LogInput } from '../../types/console';
import type { ActuatorInput, ActuatorPatch, ActuatorType } from '../../types/actuator';
import type { JointInput, JointPatch, JointType } from '../../types/joint';
import type { CameraView } from '../../types/viewport';
import type { ExecutionState } from '../../features/code-studio/runtime/executionTypes';

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

  // ── C1 Robot Model Connector: events (published after a change is applied) ──
  'robotModel.componentAdded': { componentId: string; name: string; parentId: string | null };
  'robotModel.componentRemoved': { componentId: string; name: string; reparentedChildren: string[]; removedJoints: string[] };
  'robotModel.componentReparented': { componentId: string; from: string | null; to: string | null };
  'robotModel.jointCreated': { jointId: string; type: JointType; parentId: string; childId: string };
  'robotModel.jointUpdated': { jointId: string; changed: string[] };
  'robotModel.jointDeleted': { jointId: string; parentId: string; childId: string };
  'robotModel.rejected': { command: string; errors: string[] };
  'robotModel.actuatorCreated': { actuatorId: string; type: ActuatorType; jointId: string };
  'robotModel.actuatorUpdated': { actuatorId: string; changed: string[] };
  'robotModel.actuatorDeleted': { actuatorId: string };
  'robotModel.controllerChanged': { controllerId: string; change: 'added' | 'updated' | 'removed' };
  'robotModel.changed': { reason: string; componentCount: number; jointCount: number; actuatorCount: number };

  // ── C1 Robot Model Connector: requests (any module may ask for a change) ──
  'robotModel.request.reparent': { componentId: string; parentId: string | null };
  'robotModel.request.removeComponent': { componentId: string };
  'robotModel.request.createJoint': JointInput;
  'robotModel.request.updateJoint': { jointId: string; patch: JointPatch };
  'robotModel.request.deleteJoint': { jointId: string };
  'robotModel.request.createActuator': ActuatorInput;
  'robotModel.request.updateActuator': { actuatorId: string; patch: ActuatorPatch };
  'robotModel.request.deleteActuator': { actuatorId: string };

  // ── C2 Command Bus ──
  /** Any module may request a robot command; it is validated like UI commands. */
  'command.request': { type: CommandType; payload: unknown; robotId?: string; source?: CommandSource };
  'command.accepted': { command: RobotCommand };
  'command.rejected': { command: RobotCommand; errors: string[] };
  'command.status': { commandId: string; type: CommandType; status: CommandStatus; detail?: string };
  'robot.modeChanged': { mode: 'build' | 'control' | 'code' };

  // ── Code Studio (Phase 4). Programs move the robot only through C2 (source 'code'). ──
  'codeStudio.programChanged': { programId: string; projectId: string; change: 'created' | 'saved' | 'renamed' | 'deleted' };
  /** Execution lifecycle of a program run. */
  'codeStudio.execution': { sessionId: string; programId: string; state: ExecutionState; detail?: string };
}

export type BusChannel = keyof BusChannels;

export interface FutureConnector {
  code: string;
  name: string;
  carries: string;
  phase: string;
}

/** Connectors from the master build plan and when each becomes active. */
export const FUTURE_CONNECTORS: readonly FutureConnector[] = [
  { code: 'C1', name: 'Robot Model Connector', carries: 'Robot structure: parts, hierarchy, joints', phase: 'Active (Phase 2; actuators in Phase 3)' },
  { code: 'C2', name: 'Command Bus', carries: 'Commands: drive, turn, setJointTarget, stop, reset', phase: 'Active (Phase 3)' },
  { code: 'C3', name: 'Sensor Stream', carries: 'Distance, IMU, camera and lidar readings', phase: 'Phase 6 / F' },
  { code: 'C4', name: 'Sim State Stream', carries: 'Pose of every part, each physics frame', phase: 'Phase 5 / E' },
  { code: 'C5', name: 'Environment Connector', carries: 'Floors, walls, obstacles, zones', phase: 'Phase 7 / I' },
  { code: 'C6', name: 'Project Storage Connector', carries: 'Cloud save, load and versions', phase: 'Phase 8 / H' },
  { code: 'C7', name: 'Telemetry and Log', carries: 'Logs, errors, scores, performance', phase: 'Active (local console)' },
  { code: 'C8', name: 'AI Connector', carries: 'AI requests, plans and generated code', phase: 'Phase J' },
];
