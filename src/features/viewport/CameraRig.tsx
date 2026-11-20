import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { PerspectiveCamera, Vector3 } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { canDrive, useRobotStateStore } from '../../stores/robotStateStore';
import { useSceneStore } from '../../stores/sceneStore';
import type { Vec3 } from '../../types/scene';
import { useViewportStore } from '../../stores/viewportStore';
import { worldSceneBounds } from '../robot-model/transforms';
import { cameraPosition, classifyView, framingDistance } from './cameraPresets';
import { resolveEnvironment, useEnvironmentStore } from '../environment/store/environmentStore';
import { useSimulationStore } from '../physics/simulation/simulationStore';

interface Animation {
  fromPos: Vector3;
  toPos: Vector3;
  fromTarget: Vector3;
  toTarget: Vector3;
  t: number;
}

const DURATION = 0.45;
/** Frames without movement before the camera counts as settled. */
const SETTLE_FRAMES = 4;
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

/** Components as currently shown: live (driven) poses replace design transforms. */
function liveObjects() {
  const { rootPoses } = useRobotStateStore.getState();
  return useSceneStore.getState().objects.map((o) => (rootPoses[o.id] ? { ...o, transform: rootPoses[o.id]! } : o));
}

/**
 * Phase 7: the camera frames the environment too — in the Environment Editor (its
 * draft) and in Test Mode (the saved environment the physics engine runs). Ground
 * planes are left out so a large floor does not push the camera far away.
 */
function sceneBounds(): { center: Vec3; radius: number } {
  const robot = worldSceneBounds(liveObjects());
  const mode = useRobotStateStore.getState().mode;
  const physics = useSimulationStore.getState().engine === 'physics';
  const env = mode === 'environment' ? useEnvironmentStore.getState().draft : canDrive(mode) && physics ? resolveEnvironment(useSimulationStore.getState().settings.environment) : null;
  const solids = env?.objects.filter((o) => o.kind !== 'ground') ?? [];
  if (solids.length === 0) return robot;
  const min: Vec3 = [robot.center[0] - robot.radius, robot.center[1] - robot.radius, robot.center[2] - robot.radius];
  const max: Vec3 = [robot.center[0] + robot.radius, robot.center[1] + robot.radius, robot.center[2] + robot.radius];
  for (const o of solids) {
    const r = Math.hypot(o.size[0], o.size[1], o.size[2]) / 2;
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i]!, o.position[i]! - r);
      max[i] = Math.max(max[i]!, o.position[i]! + r);
    }
  }
  const center: Vec3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  return { center, radius: Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2 };
}

/**
 * Moves the camera for view and frame requests, and keeps the view label in
 * sync with the real camera. Whatever moves the camera (toolbar buttons, the
 * orientation gizmo, orbit drags, damping), once it settles its direction is
 * classified as a standard view or "custom" and written to the one
 * `viewportStore.activeView`. There is no second camera-state system.
 */
export function CameraRig() {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const viewRequest = useViewportStore((s) => s.viewRequest);
  const frameRequest = useViewportStore((s) => s.frameRequest);
  const focusRequest = useViewportStore((s) => s.focusRequest);
  const anim = useRef<Animation | null>(null);
  const motion = useRef({ pos: new Vector3(), target: new Vector3(), moving: false, still: 0 });
  const followed = useRef<Vec3 | null>(null);

  const fov = camera instanceof PerspectiveCamera ? camera.fov : 45;

  const start = (toPos: Vector3, toTarget: Vector3) => {
    if (!controls) return;
    anim.current = { fromPos: camera.position.clone(), toPos, fromTarget: controls.target.clone(), toTarget, t: 0 };
  };

  // Preset view (Perspective, Front, Back, Left, Right, Top).
  useEffect(() => {
    if (!viewRequest || !controls) return;
    const bounds = sceneBounds();
    const distance = framingDistance(bounds.radius, fov);
    const pos = cameraPosition(bounds.center, viewRequest.view, distance);
    start(new Vector3(...pos), new Vector3(...bounds.center));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewRequest, controls]);

  // Frame all objects, keeping the current viewing direction.
  useEffect(() => {
    if (frameRequest === 0 || !controls) return;
    const bounds = sceneBounds();
    const target = new Vector3(...bounds.center);
    const direction = camera.position.clone().sub(controls.target);
    if (direction.lengthSq() < 1e-6) direction.set(0.62, 0.48, 0.62);
    direction.normalize();
    const pos = target.clone().add(direction.multiplyScalar(framingDistance(bounds.radius, fov)));
    start(pos, target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameRequest, controls]);

  // Frame one component (Phase 11 inspection), keeping the current viewing direction.
  useEffect(() => {
    if (!focusRequest || !controls) return;
    const objects = liveObjects();
    if (!objects.some((o) => o.id === focusRequest.id)) return;
    const bounds = worldSceneBounds(objects.map((o) => ({ ...o, visible: o.id === focusRequest.id })));
    const target = new Vector3(...bounds.center);
    const direction = camera.position.clone().sub(controls.target);
    if (direction.lengthSq() < 1e-6) direction.set(0.62, 0.48, 0.62);
    direction.normalize();
    start(target.clone().add(direction.multiplyScalar(framingDistance(bounds.radius, fov))), target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest, controls]);

  // A user drag interrupts a running animation.
  useEffect(() => {
    if (!controls) return;
    const cancel = () => {
      anim.current = null;
    };
    controls.addEventListener('start', cancel);
    return () => controls.removeEventListener('start', cancel);
  }, [controls]);

  useFrame((_, delta) => {
    if (!controls) return;

    // Follow the driven robot: shift camera and target by the robot's movement.
    const robot = useRobotStateStore.getState();
    const followId = canDrive(robot.mode) && useViewportStore.getState().followRobot ? Object.keys(robot.rootPoses)[0] : undefined;
    const followPos = followId ? robot.rootPoses[followId]!.position : null;
    if (followPos && followed.current && !anim.current) {
      const d = new Vector3(followPos[0] - followed.current[0], 0, followPos[2] - followed.current[2]);
      if (d.lengthSq() > 0) {
        camera.position.add(d);
        controls.target.add(d);
        controls.update();
        motion.current.pos.add(d);
        motion.current.target.add(d);
      }
    }
    followed.current = followPos ? [...followPos] : null;

    const a = anim.current;
    if (a) {
      a.t = Math.min(1, a.t + delta / DURATION);
      const e = easeOutCubic(a.t);
      camera.position.lerpVectors(a.fromPos, a.toPos, e);
      controls.target.lerpVectors(a.fromTarget, a.toTarget, e);
      controls.update();
      if (a.t >= 1) anim.current = null;
    }

    // Settle detection for the view label.
    const m = motion.current;
    // Damping keeps the camera drifting by ever smaller amounts; movement below
    // 0.01 % of the viewing distance per frame counts as standing still.
    const eps = (camera.position.distanceTo(controls.target) * 1e-4) ** 2;
    const moved = camera.position.distanceToSquared(m.pos) > eps || controls.target.distanceToSquared(m.target) > eps;
    m.pos.copy(camera.position);
    m.target.copy(controls.target);
    if (moved) {
      m.moving = true;
      m.still = 0;
      return;
    }
    if (!m.moving || anim.current) return;
    m.still += 1;
    if (m.still < SETTLE_FRAMES) return;
    m.moving = false;
    const d = camera.position.clone().sub(controls.target);
    useViewportStore.getState().setActiveView(classifyView([d.x, d.y, d.z]));
  });

  return null;
}
