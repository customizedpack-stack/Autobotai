import type { CameraView } from '../../types/viewport';
import type { Vec3 } from '../../types/scene';

/** Unit direction from the target to the camera for each preset view (Y up). */
const DIRECTIONS: Record<CameraView, Vec3> = {
  perspective: [0.62, 0.48, 0.62],
  front: [0, 0, 1],
  back: [0, 0, -1],
  right: [1, 0, 0],
  left: [-1, 0, 0],
  // A tiny Z offset keeps OrbitControls stable when looking straight down.
  top: [0, 1, 0.0001],
};

export const CAMERA_VIEWS: readonly { id: CameraView; label: string; shortcut: string }[] = [
  { id: 'perspective', label: 'Perspective', shortcut: '1' },
  { id: 'front', label: 'Front', shortcut: '2' },
  { id: 'back', label: 'Back', shortcut: '3' },
  { id: 'left', label: 'Left', shortcut: '4' },
  { id: 'right', label: 'Right', shortcut: '5' },
  { id: 'top', label: 'Top', shortcut: '6' },
];

export function viewDirection(view: CameraView): Vec3 {
  const [x, y, z] = DIRECTIONS[view];
  const length = Math.hypot(x, y, z);
  return [x / length, y / length, z / length];
}

/** Camera distance that fits a bounding sphere of `radius` in a vertical FOV (degrees). */
export function framingDistance(radius: number, fovDegrees: number, padding = 1.15): number {
  const halfFov = (fovDegrees * Math.PI) / 360;
  return Math.max(0.6, (radius / Math.sin(halfFov)) * padding);
}

export function cameraPosition(target: Vec3, view: CameraView, distance: number): Vec3 {
  const d = viewDirection(view);
  return [target[0] + d[0] * distance, target[1] + d[1] * distance, target[2] + d[2] * distance];
}

const STANDARD_VIEWS: readonly CameraView[] = ['perspective', 'front', 'back', 'left', 'right', 'top'];

/**
 * Name the standard view a camera direction matches (target -> camera),
 * or 'custom' when it matches none. Used to keep the toolbar label in sync
 * whatever moved the camera: view buttons, the orientation gizmo or a drag.
 */
export function classifyView(direction: Vec3, tolerance = 0.9995): CameraView | 'custom' {
  const length = Math.hypot(...direction);
  if (length < 1e-9) return 'custom';
  const d: Vec3 = [direction[0] / length, direction[1] / length, direction[2] / length];
  for (const view of STANDARD_VIEWS) {
    const v = viewDirection(view);
    if (d[0] * v[0] + d[1] * v[1] + d[2] * v[2] >= tolerance) return view;
  }
  return 'custom';
}
