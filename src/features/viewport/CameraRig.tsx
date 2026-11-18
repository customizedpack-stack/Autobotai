import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { PerspectiveCamera, Vector3 } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useSceneStore } from '../../stores/sceneStore';
import { useViewportStore } from '../../stores/viewportStore';
import { sceneBounds } from '../../utils/math';
import { cameraPosition, framingDistance } from './cameraPresets';

interface Animation {
  fromPos: Vector3;
  toPos: Vector3;
  fromTarget: Vector3;
  toTarget: Vector3;
  t: number;
}

const DURATION = 0.45;
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

/**
 * Moves the camera in response to view and frame requests from the viewport
 * store. Only reads stores; it never writes editor state except to cancel.
 */
export function CameraRig({ animationRef, onUserMove }: { animationRef: React.RefObject<boolean>; onUserMove: () => void }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const viewRequest = useViewportStore((s) => s.viewRequest);
  const frameRequest = useViewportStore((s) => s.frameRequest);
  const anim = useRef<Animation | null>(null);

  const fov = camera instanceof PerspectiveCamera ? camera.fov : 45;

  const start = (toPos: Vector3, toTarget: Vector3) => {
    if (!controls) return;
    anim.current = {
      fromPos: camera.position.clone(),
      toPos,
      fromTarget: controls.target.clone(),
      toTarget,
      t: 0,
    };
    animationRef.current = true;
  };

  // Preset view (Perspective, Front, Back, Left, Right, Top).
  useEffect(() => {
    if (!viewRequest || !controls) return;
    const bounds = sceneBounds(useSceneStore.getState().objects);
    const distance = framingDistance(bounds.radius, fov);
    const pos = cameraPosition(bounds.center, viewRequest.view, distance);
    start(new Vector3(...pos), new Vector3(...bounds.center));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewRequest, controls]);

  // Frame all objects, keeping the current viewing direction.
  useEffect(() => {
    if (frameRequest === 0 || !controls) return;
    const bounds = sceneBounds(useSceneStore.getState().objects);
    const target = new Vector3(...bounds.center);
    const direction = camera.position.clone().sub(controls.target);
    if (direction.lengthSq() < 1e-6) direction.set(0.62, 0.48, 0.62);
    direction.normalize();
    const pos = target.clone().add(direction.multiplyScalar(framingDistance(bounds.radius, fov)));
    start(pos, target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameRequest, controls]);

  useFrame((_, delta) => {
    const a = anim.current;
    if (!a || !controls) return;
    a.t = Math.min(1, a.t + delta / DURATION);
    const e = easeOutCubic(a.t);
    camera.position.lerpVectors(a.fromPos, a.toPos, e);
    controls.target.lerpVectors(a.fromTarget, a.toTarget, e);
    controls.update();
    if (a.t >= 1) {
      anim.current = null;
      animationRef.current = false;
    }
  });

  // A user drag interrupts any animation. Only a drag that really moved the
  // camera switches the view label to "Custom" (a plain click does not).
  useEffect(() => {
    if (!controls) return;
    const startPos = new Vector3();
    const startTarget = new Vector3();
    const onStart = () => {
      anim.current = null;
      animationRef.current = false;
      startPos.copy(camera.position);
      startTarget.copy(controls.target);
    };
    const onEnd = () => {
      if (camera.position.distanceTo(startPos) > 1e-4 || controls.target.distanceTo(startTarget) > 1e-4) {
        onUserMove();
      }
    };
    controls.addEventListener('start', onStart);
    controls.addEventListener('end', onEnd);
    return () => {
      controls.removeEventListener('start', onStart);
      controls.removeEventListener('end', onEnd);
    };
  }, [controls, camera, animationRef, onUserMove]);

  return null;
}
