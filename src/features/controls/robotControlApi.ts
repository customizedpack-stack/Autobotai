import { useRobotStateStore } from '../../stores/robotStateStore';
import { submitCommand, type SubmitResult } from './commandBus';
import type { CommandSource } from './commands';

/**
 * Robot Control API — the typed, high-level way to command the open robot.
 * Every call becomes a validated C2 command. Code Studio (Phase 4) and the AI
 * layer will use this same API, so blocks, JavaScript and AI share one path.
 *
 *   robotControl.drive.forward({ speed: 0.5, durationMs: 2000 });
 *   robotControl.turn.left({ rate: 0.5 });
 *   robotControl.stop();
 *   robotControl.joint(jointId).setTarget(0.3);
 */

export interface MotionOptions {
  /** 0 … 1, fraction of the drive's maximum (then scaled by the speed setting). Default 1. */
  speed?: number;
  /** Stop automatically after this many milliseconds. Default: until stopped. */
  durationMs?: number;
  source?: CommandSource;
}

const amount = (o: MotionOptions | undefined) => Math.abs(o?.speed ?? 1);

export const robotControl = {
  drive: {
    forward: (o?: MotionOptions): SubmitResult => submitCommand('drive', { speed: amount(o), durationMs: o?.durationMs }, o?.source),
    backward: (o?: MotionOptions): SubmitResult => submitCommand('drive', { speed: -amount(o), durationMs: o?.durationMs }, o?.source),
    /** −1 … 1; 0 releases forward/backward motion. */
    set: (speed: number, source?: CommandSource): SubmitResult => submitCommand('drive', { speed }, source),
  },
  turn: {
    left: (o?: MotionOptions): SubmitResult => submitCommand('turn', { rate: amount(o), durationMs: o?.durationMs }, o?.source),
    right: (o?: MotionOptions): SubmitResult => submitCommand('turn', { rate: -amount(o), durationMs: o?.durationMs }, o?.source),
    /** −1 (right) … 1 (left); 0 releases turning. */
    set: (rate: number, source?: CommandSource): SubmitResult => submitCommand('turn', { rate }, source),
  },
  stop: (source?: CommandSource): SubmitResult => submitCommand('stop', {}, source),
  reset: (source?: CommandSource): SubmitResult => submitCommand('reset', {}, source),
  joint: (jointId: string) => ({
    /** Move with the joint's position actuator (servo / joint actuator). */
    setTarget: (target: number, source?: CommandSource): SubmitResult => submitCommand('setJointTarget', { jointId, target, mode: 'actuator' }, source),
    /** Kinematic joint preview: jump to a position within the limits. */
    preview: (target: number, source?: CommandSource): SubmitResult => submitCommand('setJointTarget', { jointId, target, mode: 'preview' }, source),
  }),
  /** Speed setting, 0 … 100 %. */
  setSpeedPercent: (value: number) => useRobotStateStore.getState().setSpeedPercent(value),
  getState: () => {
    const { movement, speedPercent, rootPoses, jointPositions } = useRobotStateStore.getState();
    return { movement, speedPercent, rootPoses, jointPositions };
  },
};
