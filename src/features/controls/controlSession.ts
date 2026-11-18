import { bus } from '../../core/bus/connectorBus';
import { useRobotStateStore, type WorkspaceMode } from '../../stores/robotStateStore';
import { useSceneStore } from '../../stores/sceneStore';
import { log } from '../../utils/logger';
import { shutdown } from './movementEngine';

/**
 * Build Mode ↔ Control Mode.
 * Build Mode edits the design. Control Mode drives the robot; editing is
 * locked so driving cannot change the design by accident. Leaving Control
 * Mode stops all motion and returns the robot to its design pose.
 */

export function setWorkspaceMode(mode: WorkspaceMode): void {
  const robot = useRobotStateStore.getState();
  if (robot.mode === mode) return;
  shutdown();
  robot.resetRuntime();
  robot.setMode(mode);
  bus.publish('robot.modeChanged', { mode });
  log.info(
    'control',
    mode === 'control'
      ? 'Control Mode: keyboard and buttons now drive the robot. Editing is locked. Kinematic simulation (physics arrives in Phase 5).'
      : 'Build Mode: editing unlocked. The robot is back in its design pose.',
  );
}

export function toggleWorkspaceMode(): void {
  setWorkspaceMode(useRobotStateStore.getState().mode === 'control' ? 'build' : 'control');
}

/** Copy the live (driven) pose of moved components into the design, as ONE undo step. */
export function applyPoseToDesign(): boolean {
  const { rootPoses } = useRobotStateStore.getState();
  const ids = Object.keys(rootPoses);
  if (ids.length === 0) return false;
  const scene = useSceneStore.getState();
  scene.applyModel('Apply driven pose', {
    objects: scene.objects.map((o) => (rootPoses[o.id] ? { ...o, transform: rootPoses[o.id]! } : o)),
  });
  useRobotStateStore.getState().patch({ rootPoses: {} });
  log.success('control', 'Applied the driven pose to the design. Use Undo to revert it.');
  return true;
}

/** Leave Control Mode and clear live state (used when a project closes). */
export function endControlSession(): void {
  shutdown();
  const robot = useRobotStateStore.getState();
  robot.resetRuntime();
  robot.setMode('build');
}
