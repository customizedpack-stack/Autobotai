export type CameraView = 'perspective' | 'front' | 'back' | 'left' | 'right' | 'top';

/** "custom" means the user has orbited away from a preset. */
export type ActiveView = CameraView | 'custom';

export interface ViewRequest {
  view: CameraView;
  /** Increments on every request so the same view can be requested twice. */
  id: number;
}
