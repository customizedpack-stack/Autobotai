import { bus } from '../../core/bus/connectorBus';
import { useSimulationStore } from '../physics/simulation/simulationStore';
import { useRobotStateStore } from '../../stores/robotStateStore';
import { useSceneStore } from '../../stores/sceneStore';
import { createId } from '../../utils/id';
import { log } from '../../utils/logger';
import { validateCommand, type CommandContext, type CommandPayloads, type CommandSource, type CommandType, type RobotCommand } from './commands';
import * as engine from './movementEngine';

/**
 * C2 — Command Bus.
 *
 * Every robot command (from keys, panel buttons, the Robot Control API or a
 * bus request) goes through `submitCommand`:
 *   1. a command object is built (id, robot id, type, payload, timestamp),
 *   2. it is validated against the open robot (controllers, joints, actuators, limits),
 *   3. `command.rejected` (with reasons, also logged) or `command.accepted` is published,
 *   4. accepted commands go to the movement engine, which publishes `command.status`.
 */

export interface SubmitResult {
  ok: boolean;
  command: RobotCommand;
  errors: string[];
}

export function commandContext(): CommandContext {
  const { projectId, objects, joints, actuators, controllers } = useSceneStore.getState();
  const { engine, state } = useSimulationStore.getState();
  return { projectId, mode: useRobotStateStore.getState().mode, objects, joints, actuators, controllers, engine, simulation: state };
}

export function createCommand<T extends CommandType>(type: T, payload: CommandPayloads[T], source: CommandSource, robotId?: string): RobotCommand<T> {
  return {
    id: createId('cmd'),
    robotId: robotId ?? useSceneStore.getState().projectId ?? '',
    type,
    payload,
    timestamp: Date.now(),
    source,
  };
}

/** Validate and execute one command. Never throws. */
export function submitCommand<T extends CommandType>(type: T, payload: CommandPayloads[T], source: CommandSource = 'api', robotId?: string): SubmitResult {
  const command = createCommand(type, payload, source, robotId) as RobotCommand;
  const { valid, errors } = validateCommand(command, commandContext());
  if (!valid) {
    bus.publish('command.rejected', { command, errors });
    useRobotStateStore.getState().patch({ movement: { lastError: errors.join(' ') } });
    log.error('control', `Command "${type}" rejected: ${errors.join(' ')}`);
    return { ok: false, command, errors };
  }
  bus.publish('command.accepted', { command });
  try {
    engine.execute(command);
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error);
    bus.publish('command.status', { commandId: command.id, type: command.type, status: 'failed', detail: message });
    log.error('control', `Command "${type}" failed: ${message}`);
    return { ok: false, command, errors: [message] };
  }
  if (type === 'stop') log.info('control', 'Robot stopped.');
  if (type === 'reset') log.info('control', 'Robot reset to its design pose.');
  return { ok: true, command, errors: [] };
}

let connected = false;

/** Let any module send commands over the Connector Bus. Safe to call more than once. */
export function connectCommandBus(): void {
  if (connected) return;
  connected = true;
  bus.subscribe('command.request', ({ type, payload, robotId }) => {
    submitCommand(type, payload as never, 'bus', robotId);
  });
}
