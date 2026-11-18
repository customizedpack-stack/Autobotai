import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setWorkspaceMode } from '../../controls/controlSession';
import { step, STEP_SECONDS } from '../../controls/movementEngine';
import { byName, events, jointByName, openExplorer } from '../../controls/testUtils';
import { robotModel } from '../../robot-model/robotModelConnector';
import { useRobotStateStore } from '../../../stores/robotStateStore';
import { HostBridge } from './hostBridge';
import '../testUtils';

const run = (seconds: number) => {
  for (let t = 0; t < seconds - 1e-9; t += STEP_SECONDS) step(STEP_SECONDS);
};
const x = () => useRobotStateStore.getState().rootPoses[byName('Chassis').id]?.position[0] ?? 0;
let clock = 0;
const newBridge = (maxCommandsPerSecond = 30, maxPausedRequests = 50) =>
  new HostBridge({ sessionId: 'run_t', limits: { maxCommandsPerSecond, maxWaitMs: 60_000, maxPausedRequests }, now: () => clock });
const accepted = () => events('command.accepted').map((e) => e.command as { type: string; payload: Record<string, unknown> });
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  openExplorer(false);
  setWorkspaceMode('code');
  clock = 0;
});
afterEach(() => {
  vi.useRealTimers();
});

describe('host bridge (program requests → Robot Control API → C2)', () => {
  it('drives forward through C2 with source "code"; a timed move resolves when it has finished', async () => {
    const bridge = newBridge();
    let done: unknown = null;
    void bridge.handle('drive.forward', { speed: 1, durationMs: 1000 }).then((v) => (done = v));
    const accepted = events('command.accepted').at(-1)!.command as { type: string; source: string; payload: unknown };
    expect(accepted).toMatchObject({ type: 'drive', source: 'code', payload: { speed: 1, durationMs: 1000 } });
    run(0.5);
    await Promise.resolve();
    expect(done).toBeNull();
    run(0.6);
    await Promise.resolve();
    expect(done).toMatchObject({ status: 'completed' });
    expect(x()).toBeCloseTo(0.25, 2); // 1 s at 50 % of 0.5 m/s
    bridge.dispose();
  });

  it('backward, left and right turns, and combined drive + turn', async () => {
    const bridge = newBridge();
    await bridge.handle('drive.set', { speed: 0.5 });
    await bridge.handle('turn.set', { rate: 0.5 });
    run(0.5);
    const { intent } = useRobotStateStore.getState().movement;
    expect(intent).toEqual({ linear: 0.5, angular: 0.5 });
    await bridge.handle('stop', {});
    expect(useRobotStateStore.getState().movement.intent).toEqual({ linear: 0, angular: 0 });
    void bridge.handle('turn.right', { rate: 0.4, durationMs: 500 });
    expect(useRobotStateStore.getState().movement.intent.angular).toBe(-0.4);
    void bridge.handle('drive.backward', { speed: 0.3, durationMs: 500 });
    expect(useRobotStateStore.getState().movement.intent.linear).toBe(-0.3);
    void bridge.handle('turn.left', {});
    expect(useRobotStateStore.getState().movement.intent.angular).toBe(1);
    bridge.dispose();
  });

  it('keeps Build Mode restrictions: commands are rejected with the C2 message', async () => {
    setWorkspaceMode('build');
    const bridge = newBridge();
    await expect(bridge.handle('drive.forward', { speed: 0.5 })).rejects.toThrow('Switch to Control Mode to move the robot.');
    expect(events('command.rejected').length).toBe(1);
    bridge.dispose();
  });

  it('reports invalid values, missing actuators and missing joints with useful errors', async () => {
    const bridge = newBridge();
    await expect(bridge.handle('drive.set', { speed: 3 })).rejects.toThrow('speed must be between −1 and 1.');
    await expect(bridge.handle('drive.forward', { speed: 'fast' })).rejects.toThrow('drive.forward: speed must be a number.');
    await expect(bridge.handle('joint.setTarget', { jointId: 'nope', target: 0 })).rejects.toThrow('Joint "nope" does not exist in this robot.');
    const wheel = jointByName('Left Wheel Joint');
    await expect(bridge.handle('joint.setTarget', { jointId: wheel.id, target: 0.5 })).rejects.toThrow(/speed-controlled/);
    const disabled = robotModel.updateActuator(useRobotStateStore.getState() && (robotModel.getModel().actuators.find((a) => a.jointId === wheel.id)!.id), { enabled: false });
    expect(disabled.ok).toBe(true);
    await expect(bridge.handle('drive.set', { speed: 0.5 })).rejects.toThrow('Motor "Left Drive Motor" is disabled.');
    await expect(bridge.handle('setSpeedPercent', { value: 150 })).rejects.toThrow('Speed percent must be between 0 and 100.');
    await expect(bridge.handle('wait', { ms: 120_000 })).rejects.toThrow('wait() takes 0 to 60000 ms.');
    bridge.dispose();
  });

  it('enforces the command rate limit', async () => {
    const bridge = newBridge(3);
    await bridge.handle('drive.set', { speed: 0.1 });
    await bridge.handle('drive.set', { speed: 0.2 });
    await bridge.handle('drive.set', { speed: 0.3 });
    await expect(bridge.handle('drive.set', { speed: 0.4 })).rejects.toThrow(/Too many robot commands/);
    clock = 1000;
    await expect(bridge.handle('drive.set', { speed: 0.4 })).resolves.toBeTruthy();
    bridge.dispose();
  });

  it('pause stops the robot and holds requests; resume continues the remaining time', async () => {
    const bridge = newBridge();
    let done: unknown = null;
    void bridge.handle('drive.forward', { speed: 1, durationMs: 1000 }).then((v) => (done = v));
    run(0.4);
    clock = 400;
    bridge.pause();
    expect(useRobotStateStore.getState().movement.intent.linear).toBe(0);
    const atPause = x();
    let held = false;
    // A robot command (same speed setting, so the path is unchanged) must wait until Resume.
    void bridge.handle('setSpeedPercent', { value: 50 }).then(() => (held = true));
    run(0.5);
    await Promise.resolve();
    expect(x()).toBeCloseTo(atPause, 6);
    expect(held).toBe(false);
    expect(done).toBeNull();
    clock = 5000;
    bridge.resume();
    await new Promise((r) => setTimeout(r, 0));
    expect(held).toBe(true);
    const resumed = events('command.accepted').map((e) => e.command as { type: string; payload: { durationMs?: number } }).filter((c) => c.type === 'drive').at(-1)!;
    expect(resumed.payload.durationMs).toBe(600);
    run(0.65);
    await Promise.resolve();
    expect(done).toMatchObject({ status: 'completed' });
    expect(x()).toBeCloseTo(0.25, 2); // the full second was driven in total
    bridge.dispose();
  });

  it('waits are paused too', async () => {
    vi.useFakeTimers();
    const bridge = newBridge();
    let waited = false;
    void bridge.handle('wait', { ms: 1000 }).then(() => (waited = true));
    clock = 0;
    await vi.advanceTimersByTimeAsync(400);
    clock = 400;
    bridge.pause();
    await vi.advanceTimersByTimeAsync(2000);
    expect(waited).toBe(false);
    clock = 2400;
    bridge.resume();
    await vi.advanceTimersByTimeAsync(599);
    expect(waited).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    expect(waited).toBe(true);
    bridge.dispose();
  });

  it('joint targets move the joint through C2 and resolve on arrival; joint info and list', async () => {
    openExplorer(false, 'robotic-arm');
    const elbow = jointByName('Elbow');
    expect(robotModel.createActuator({ type: 'jointActuator', jointId: elbow.id, maxVelocity: 2 }).ok).toBe(true);
    setWorkspaceMode('code');
    const bridge = newBridge();
    let reached: unknown = null;
    void bridge.handle('joint.setTarget', { jointId: elbow.id, target: 1 }).then((v) => (reached = v));
    let waitDone = false;
    void bridge.handle('joint.wait', { jointId: elbow.id }).then(() => (waitDone = true));
    run(0.25);
    await Promise.resolve();
    expect(reached).toBeNull();
    const info = (await bridge.handle('joint.info', { jointId: elbow.id })) as { position: number; moving: boolean; hasActuator: boolean };
    expect(info.position).toBeCloseTo(0.5, 2);
    expect(info).toMatchObject({ moving: true, hasActuator: true });
    run(0.5);
    await Promise.resolve();
    await Promise.resolve();
    expect(reached).toMatchObject({ status: 'completed' });
    expect(waitDone).toBe(true);
    await expect(bridge.handle('joint.setTarget', { jointId: elbow.id, target: 99 })).rejects.toThrow(/upper limit/);
    const list = (await bridge.handle('joints', {})) as { name: string }[];
    expect(list.map((j) => j.name)).toContain('Elbow');
    await bridge.handle('joint.preview', { jointId: elbow.id, target: 0.2 });
    expect(useRobotStateStore.getState().jointPositions[elbow.id]).toBeCloseTo(0.2, 6);
    bridge.dispose();
  });

  it('getState returns the existing API snapshot; reset uses the API reset', async () => {
    const bridge = newBridge();
    await bridge.handle('drive.set', { speed: 1 });
    run(0.3);
    const state = (await bridge.handle('getState', {})) as { movement: { status: string }; speedPercent: number; rootPoses: object; jointPositions: object };
    expect(Object.keys(state).sort()).toEqual(['jointPositions', 'movement', 'rootPoses', 'speedPercent']);
    expect(state.movement.status).toBe('moving');
    await bridge.handle('reset', {});
    expect(useRobotStateStore.getState().rootPoses).toEqual({});
    expect(events('command.accepted').at(-1)!.command).toMatchObject({ type: 'reset', source: 'code' });
    bridge.dispose();
  });

  it('refuses requests after dispose', async () => {
    const bridge = newBridge();
    bridge.dispose();
    await expect(bridge.handle('stop', {})).rejects.toThrow('The program is no longer running.');
  });

  // ── Regression: bounded paused queue (Phase 4 review, defect 2) ──
  describe('paused request queue', () => {
    it('holds robot requests up to the limit and rejects the rest at once with a readable error', async () => {
      const bridge = newBridge(30, 3);
      bridge.pause();
      const before = accepted().length;
      const held = [1, 2, 3].map((n) => bridge.handle('setSpeedPercent', { value: 40 + n }));
      expect(bridge.queuedRequests).toBe(3);
      await expect(bridge.handle('drive.set', { speed: 0.5 })).rejects.toThrow('Too many requests while the program is paused (limit 3). Resume or stop the program first.');
      await expect(bridge.handle('wait', { ms: 10 })).rejects.toThrow(/Too many requests/);
      expect(bridge.queuedRequests).toBe(3);
      // Nothing held is executed while paused.
      await flush();
      expect(accepted().length).toBe(before); // measured after the pause: nothing new ran
      bridge.resume();
      await expect(Promise.all(held)).resolves.toHaveLength(3);
      expect(useRobotStateStore.getState().speedPercent).toBe(43);
      bridge.dispose();
    });

    it('runs held requests in order after resume, and the limit applies again on the next pause', async () => {
      const bridge = newBridge(30, 2);
      for (let cycle = 0; cycle < 3; cycle++) {
        clock += 2000; // a fresh rate-limit window per cycle
        bridge.pause();
        const a = bridge.handle('drive.set', { speed: 0.2 + cycle / 10 });
        const b = bridge.handle('turn.set', { rate: -0.3 });
        await expect(bridge.handle('turn.set', { rate: 0.9 })).rejects.toThrow(/limit 2/);
        bridge.resume();
        await Promise.all([a, b]);
        const tail = accepted().slice(-2).map((c) => c.type);
        expect(tail).toEqual(['drive', 'turn']);
        expect(useRobotStateStore.getState().movement.intent).toEqual({ linear: 0.2 + cycle / 10, angular: -0.3 });
        expect(bridge.queuedRequests).toBe(0);
      }
      bridge.dispose();
    });

    it('answers read-only requests while paused without moving the robot or using the queue', async () => {
      const bridge = newBridge(30, 1);
      await bridge.handle('drive.set', { speed: 1 });
      bridge.pause();
      const count = accepted().length;
      const state = (await bridge.handle('getState', {})) as { movement: { intent: { linear: number } } };
      expect(state.movement.intent.linear).toBe(0);
      const joints = (await bridge.handle('joints', {})) as unknown[];
      expect(joints.length).toBe(2);
      await expect(bridge.handle('joint.info', { jointId: jointByName('Left Wheel Joint').id })).resolves.toMatchObject({ name: 'Left Wheel Joint' });
      expect(bridge.queuedRequests).toBe(0);
      expect(accepted().length).toBe(count);
      bridge.dispose();
    });

    it('stop() while paused is handled at once (never queued) and Resume does not restart the interrupted motion', async () => {
      const bridge = newBridge(30, 1);
      let drove: unknown = null;
      void bridge.handle('drive.forward', { speed: 1, durationMs: 2000 }).then((v) => (drove = v));
      run(0.3);
      bridge.pause();
      void bridge.handle('setSpeedPercent', { value: 60 });
      expect(bridge.queuedRequests).toBe(1);
      const before = accepted().length;
      const stopped = await bridge.handle('stop', {});
      // Handled immediately through the API and C2 (tracked), and never added to the queue.
      expect(stopped).toMatchObject({ status: 'completed' });
      expect(accepted().length).toBe(before + 1);
      expect(accepted().at(-1)).toMatchObject({ type: 'stop' });
      expect(bridge.queuedRequests).toBe(1);
      await flush();
      expect(drove).toMatchObject({ status: 'stopped' });
      const xAtPause = x();
      bridge.resume();
      await flush();
      run(0.5);
      expect(x()).toBeCloseTo(xAtPause, 6);
      expect(useRobotStateStore.getState().movement.intent).toEqual({ linear: 0, angular: 0 });
      // The held, non-motion request still ran on resume, in order.
      expect(useRobotStateStore.getState().speedPercent).toBe(60);
      bridge.dispose();
    });

    // ── Final review: Stop must respect queue bounds ──
    it('repeated stop() calls while paused are merged: one C2 stop, no queue growth, every promise settles', async () => {
      const bridge = newBridge(30, 2);
      bridge.pause();
      const before = accepted().length;
      const stops = Array.from({ length: 200 }, () => bridge.handle('stop', {}));
      const results = (await Promise.all(stops)) as { commandId: string; merged?: boolean }[];
      expect(results).toHaveLength(200);
      expect(accepted().length).toBe(before + 1);
      expect(new Set(results.map((r) => r.commandId)).size).toBe(1);
      expect(results.slice(1).every((r) => r.merged)).toBe(true);
      expect(bridge.queuedRequests).toBe(0);
      bridge.dispose();
    });

    it('stop() while the queue is full stays responsive, supersedes held motion, and the queue never exceeds its limit', async () => {
      const bridge = newBridge(30, 3);
      bridge.pause();
      const held = [bridge.handle('drive.set', { speed: 0.5 }), bridge.handle('turn.set', { rate: 0.5 }), bridge.handle('wait', { ms: 5 })];
      expect(bridge.queuedRequests).toBe(3);
      await expect(bridge.handle('drive.set', { speed: 1 })).rejects.toThrow(/Too many requests/);
      await expect(bridge.handle('stop', {})).resolves.toMatchObject({ status: 'completed' });
      // Held motion is superseded by the stop; the wait keeps its place.
      const settled = await Promise.allSettled(held.slice(0, 2));
      expect(settled.map((r) => r.status === 'fulfilled' && (r.value as { status: string }).status)).toEqual(['superseded', 'superseded']);
      expect(bridge.queuedRequests).toBe(1);
      let maxSeen = bridge.queuedRequests;
      for (let i = 0; i < 50; i++) {
        void bridge.handle(i % 3 === 0 ? 'stop' : 'drive.set', { ...(i % 3 === 0 ? {} : { speed: 0.1 }) }).catch(() => undefined);
        maxSeen = Math.max(maxSeen, bridge.queuedRequests);
      }
      expect(maxSeen).toBeLessThanOrEqual(3);
      bridge.resume();
      await held[2];
      run(0.5);
      // Only motion requested AFTER the last stop (i = 49) runs; everything held before a stop was superseded.
      expect(useRobotStateStore.getState().movement.intent).toEqual({ linear: 0.1, angular: 0 });
      bridge.dispose();
    });

    it('disposal rejects every held request, so no promise is left unresolved', async () => {
      const bridge = newBridge(30, 10);
      bridge.pause();
      const held = [bridge.handle('drive.set', { speed: 0.5 }), bridge.handle('wait', { ms: 100 }), bridge.handle('joint.wait', { jointId: jointByName('Left Wheel Joint').id })];
      const before = accepted().length;
      bridge.dispose();
      const settled = await Promise.allSettled(held);
      expect(settled.map((r) => r.status)).toEqual(['rejected', 'rejected', 'rejected']);
      expect(settled.every((r) => r.status === 'rejected' && (r.reason as Error).message === 'The program is no longer running.')).toBe(true);
      expect(bridge.queuedRequests).toBe(0);
      expect(accepted().length).toBe(before); // nothing executed on the way out
    });
  });
});
