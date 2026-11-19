import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { DataTexture, LinearMipmapLinearFilter, PerspectiveCamera, RepeatWrapping, RGBAFormat, SRGBColorSpace, WebGLRenderTarget, type Mesh } from 'three';
import { useRobotStateStore } from '../../../stores/robotStateStore';
import { resolveEnvironment, useEnvironmentStore } from '../../environment/store/environmentStore';
import { useSimulationStore } from '../../physics/simulation/simulationStore';
import { applyCamera, resolutionSize } from '../cameraMath';
import { attachRenderer, frame, type CameraRendererBackend } from '../cameraManager';
import { CAMERA_LAYER } from './cameraLayer';

/**
 * Robot camera renderer (Phase 8). Lives inside the existing React Three Fiber canvas and
 * uses its renderer and scene: no second engine, scene, physics world or render loop.
 *
 * - Every animation frame it lets the camera manager decide which cameras are due; only
 *   those are rendered, each into its own render target, with a dedicated Three.js
 *   camera restricted to CAMERA_LAYER (no editor helpers, no recursive viewport image).
 * - The pixels are read back once per rendered frame and handed to the manager, which
 *   delivers them to the Camera Monitor, program subscriptions and captures.
 * - Render targets are created on first use, recreated when the resolution changes, and
 *   disposed when the manager releases a camera, or when this component unmounts
 *   (leaving the workspace, closing the project).
 */

interface Entry {
  target: WebGLRenderTarget;
  camera: PerspectiveCamera;
  buffer: Uint8Array;
  width: number;
  height: number;
}

/**
 * A tiled floor texture: 0.5 m checker tiles with joint lines, so camera images show the
 * robot moving even on an empty floor. One texture covers 1 m (2 × 2 tiles).
 */
function floorTexture(): DataTexture {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const line = x % 32 < 2 || y % 32 < 2;
      const dark = (x < 32) !== (y < 32);
      const i = (y * size + x) * 4;
      const [r, g, b] = line ? [104, 114, 130] : dark ? [50, 57, 70] : [74, 83, 99];
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  const texture = new DataTexture(data, size, size, RGBAFormat);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(100, 100);
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

/** The floor the cameras see when the environment has no ground object (the physics engine's default floor). */
function CameraFloor() {
  const texture = useMemo(floorTexture, []);
  useEffect(() => () => texture.dispose(), [texture]);
  const mode = useRobotStateStore((s) => s.mode);
  const engine = useSimulationStore((s) => s.engine);
  const selected = useSimulationStore((s) => s.settings.environment);
  const draft = useEnvironmentStore((s) => s.draft);
  const saved = useEnvironmentStore((s) => s.environments);
  const hasGround = useMemo(() => {
    const env = mode === 'environment' ? draft : (mode === 'control' || mode === 'code') && engine === 'physics' ? resolveEnvironment(selected) : null;
    return Boolean(env?.objects.some((o) => o.kind === 'ground' && o.visible));
    // `saved` keeps the resolved environment fresh after a save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, engine, selected, draft, saved]);
  if (hasGround) return null;
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, -0.0005, 0]}
      raycast={() => null}
      ref={(m: Mesh | null) => m?.layers.set(CAMERA_LAYER)}
      receiveShadow
      name="camera-floor"
    >
      <planeGeometry args={[100, 100]} />
      <meshStandardMaterial map={texture} roughness={0.95} metalness={0} />
    </mesh>
  );
}

export function CameraRenderer() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const entries = useRef(new Map<string, Entry>());

  useEffect(() => {
    const map = entries.current;
    const release = (id?: string) => {
      for (const [key, entry] of map) {
        if (id !== undefined && key !== id) continue;
        entry.target.dispose();
        map.delete(key);
      }
    };
    const backend: CameraRendererBackend = {
      render(config, pose) {
        const { width, height } = resolutionSize(config.resolution);
        let entry = map.get(config.id);
        if (entry && (entry.width !== width || entry.height !== height)) {
          entry.target.dispose();
          map.delete(config.id);
          entry = undefined;
        }
        if (!entry) {
          const target = new WebGLRenderTarget(width, height, { depthBuffer: true, samples: 0 });
          target.texture.colorSpace = SRGBColorSpace;
          const camera = new PerspectiveCamera();
          camera.layers.set(CAMERA_LAYER);
          entry = { target, camera, buffer: new Uint8Array(width * height * 4), width, height };
          map.set(config.id, entry);
        }
        applyCamera(entry.camera, config, pose);
        const previousTarget = gl.getRenderTarget();
        const previousShadowUpdate = gl.shadowMap.autoUpdate;
        try {
          // Shadow maps do not depend on the camera: reuse the main view's instead of redrawing them.
          gl.shadowMap.autoUpdate = false;
          gl.setRenderTarget(entry.target);
          gl.clear(true, true, true);
          gl.render(scene, entry.camera);
          gl.readRenderTargetPixels(entry.target, 0, 0, width, height, entry.buffer);
        } catch (error) {
          return { error: `The camera image could not be rendered: ${error instanceof Error ? error.message : String(error)}` };
        } finally {
          gl.setRenderTarget(previousTarget);
          gl.shadowMap.autoUpdate = previousShadowUpdate;
        }
        // WebGL reads bottom-up; images are top-down. A fresh copy each frame, so receivers own their data.
        const data = new Uint8ClampedArray(width * height * 4);
        const row = width * 4;
        for (let y = 0; y < height; y++) data.set(entry.buffer.subarray((height - 1 - y) * row, (height - y) * row), y * row);
        return { width, height, data };
      },
      release,
      allocated: () => map.size,
    };
    attachRenderer(backend);
    return () => {
      attachRenderer(null);
      release();
    };
  }, [gl, scene]);

  // Default priority: runs before R3F draws the main view, and never takes over its rendering.
  useFrame(() => {
    frame();
  });

  return <CameraFloor />;
}
