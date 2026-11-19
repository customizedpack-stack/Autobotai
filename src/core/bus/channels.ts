import type { CommandSource, CommandType, RobotCommand } from '../../features/controls/commands';
import type { CommandStatus } from '../../features/controls/movementEngine';
import type { LogInput } from '../../types/console';
import type { ActuatorInput, ActuatorPatch, ActuatorType } from '../../types/actuator';
import type { JointInput, JointPatch, JointType } from '../../types/joint';
import type { CameraView } from '../../types/viewport';
import type { ExecutionState } from '../../features/code-studio/runtime/executionTypes';
import type { SimulationEngine, SimulationRunState } from '../../features/physics/simulation/simulationStore';
import type { SensorReading, SensorSourceKind } from '../../features/sensors/core/sensorTypes';
import type { SensorType } from '../../types/sensor';

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
  'robotModel.sensorChanged': { sensorId: string; change: 'added' | 'updated' | 'removed'; previousId?: string };
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
  'robot.modeChanged': { mode: 'build' | 'control' | 'code' | 'environment' };

  // ── Code Studio (Phase 4). Programs move the robot only through C2 (source 'code'). ──
  'codeStudio.programChanged': { programId: string; projectId: string; change: 'created' | 'saved' | 'renamed' | 'deleted' };
  /** Execution lifecycle of a program run. */
  'codeStudio.execution': { sessionId: string; programId: string; state: ExecutionState; detail?: string };

  // ── Physics simulation (Phase 5) ──
  /** Engine choice or simulation state changed. */
  'simulation.changed': { engine: SimulationEngine; state: SimulationRunState; previousEngine: SimulationEngine; previousState: SimulationRunState; reason?: string };

  // ── C5 Environment Connector (Phase 7) ──
  /** A saved environment was created, saved, or deleted. */
  'environment.changed': { environmentId: string; change: 'created' | 'saved' | 'deleted' };
  /** An environment was opened in the Environment Editor. */
  'environment.opened': { environmentId: string; name: string };
  /** One undoable edit of the open environment (not published per physics frame). */
  'environment.edited': { environmentId: string; reason: string; objectCount: number };
  /** The environment the physics simulation uses changed. */
  'simulation.environmentChanged': { environmentId: string };

  // ── C3 Sensor Stream (Phase 6): lifecycle only. Readings flow through the stream itself, not the bus. ──
  /** The stream started, paused, resumed or stopped. */
  'sensor.stream': { state: 'off' | 'running' | 'paused'; source: SensorSourceKind; session: number; sensors: number };
  /** One sensor's lifecycle: started, stopped, enabled, disabled, error, recovered, reset. */
  'sensor.event': {
    sensorId: string;
    sensorType: SensorType;
    event: 'started' | 'stopped' | 'enabled' | 'disabled' | 'error' | 'recovered' | 'reset';
    timestamp: number;
    session: number;
    source: SensorSourceKind | null;
    valid: boolean;
    reading: SensorReading | null;
    detail?: string;
  };
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
  { code: 'C3', name: 'Sensor Stream', carries: 'Distance, wheel encoder and IMU readings (camera and lidar later)', phase: 'Active (Phase 6)' },
  { code: 'C4', name: 'Sim State Stream', carries: 'Pose of every part, each physics frame', phase: 'Phase 5 (runtime state via robotStateStore)' },
  { code: 'C5', name: 'Environment Connector', carries: 'Ground, walls, boxes, platforms, ramps, obstacles', phase: 'Active (Phase 7)' },
  { code: 'C6', name: 'Project Storage Connector', carries: 'Cloud save, load and versions', phase: 'Phase 8 / H' },
  { code: 'C7', name: 'Telemetry and Log', carries: 'Logs, errors, scores, performance', phase: 'Active (local console)' },
  { code: 'C8', name: 'AI Connector', carries: 'AI requests, plans and generated code', phase: 'Phase J' },
];
