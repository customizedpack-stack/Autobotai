import { create } from 'zustand';

/**
 * UI snapshot of the cameras (Phase 8). Written by the camera manager at most 5 times per
 * second, so the Camera Monitor re-renders rarely; frames themselves never go through
 * React state (the monitor draws them straight onto its canvas).
 */
export type CameraStatus = 'idle' | 'live' | 'disabled' | 'error';

export interface CameraUiState {
  status: CameraStatus;
  frames: number;
  fps: number;
  error?: string;
}

interface CameraStore {
  cameras: Record<string, CameraUiState>;
  /** Camera shown in the Camera Monitor. */
  selectedId: string | null;
  /** The monitor's feed is paused (the camera is then not rendered for the monitor). */
  paused: boolean;
  setCameras: (cameras: Record<string, CameraUiState>) => void;
  select: (id: string | null) => void;
  setPaused: (paused: boolean) => void;
}

export const useCameraStore = create<CameraStore>((set) => ({
  cameras: {},
  selectedId: null,
  paused: false,
  setCameras: (cameras) => set({ cameras }),
  select: (selectedId) => set({ selectedId }),
  setPaused: (paused) => set({ paused }),
}));
