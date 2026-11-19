import { BoxGeometry, CylinderGeometry, Mesh, MeshBasicMaterial, Euler, type Object3D } from 'three';
import type { EnvironmentObject } from '../../../types/environment';
import type { CameraSensorConfig } from '../../../types/sensor';
import { resolutionSize, type CameraPose } from '../cameraMath';
import { attachRenderer, configureCameras, type CameraRendererBackend } from '../cameraManager';

/**
 * A stand-in for the WebGL renderer (tests run without a GPU). It records what was rendered
 * and returns a solid-color image; `paint` can choose the color from the camera pose.
 */
export function fakeRenderer(paint: (config: CameraSensorConfig, pose: CameraPose) => [number, number, number] = () => [100, 150, 200]) {
  const allocated = new Set<string>();
  const released: (string | undefined)[] = [];
  const rendered: { id: string; pose: CameraPose }[] = [];
  const backend: CameraRendererBackend = {
    render(config, pose) {
      allocated.add(config.id);
      rendered.push({ id: config.id, pose });
      const { width, height } = resolutionSize(config.resolution);
      const data = new Uint8ClampedArray(width * height * 4);
      const [r, g, b] = paint(config, pose);
      for (let i = 0; i < data.length; i += 4) {
        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
        data[i + 3] = 255;
      }
      return { width, height, data };
    },
    release(id) {
      released.push(id);
      if (id === undefined) allocated.clear();
      else allocated.delete(id);
    },
    allocated: () => allocated.size,
  };
  attachRenderer(backend);
  return { backend, allocated, released, rendered };
}

export function resetCameraManager(): void {
  attachRenderer(null);
  configureCameras();
}

/** Plain Three.js meshes for environment objects (boxes, walls, platforms, pillars), for ray-cast visibility checks. */
export function environmentMeshes(objects: readonly EnvironmentObject[]): Object3D[] {
  return objects.map((o) => {
    const [x, y, z] = o.size;
    const geometry = o.kind === 'obstacle' && o.shape === 'cylinder' ? new CylinderGeometry(x / 2, x / 2, y, 24) : new BoxGeometry(x, y, z);
    const mesh = new Mesh(geometry, new MeshBasicMaterial());
    mesh.position.set(...o.position);
    mesh.rotation.copy(new Euler(...o.rotation));
    mesh.name = o.name;
    mesh.updateMatrixWorld(true);
    return mesh;
  });
}
