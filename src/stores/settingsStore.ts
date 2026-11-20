import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeStorage } from '../utils/storage';

export type RotationUnit = 'deg' | 'rad';
/** Phase 11: how the app presents itself. Never changes project data. */
export type ExperienceMode = 'beginner' | 'professional' | 'reverse';

interface SettingsState {
  rotationUnit: RotationUnit;
  /** Step used by the arrow keys in position fields, in meters. */
  positionStep: number;
  confirmUnsavedOnLeave: boolean;
  showShortcutHints: boolean;
  /** Phase 11. Professional keeps the full Phase 10 workspace and is the default. */
  experienceMode: ExperienceMode;
  /** The user picked a mode at least once (the dashboard stops asking). */
  experienceChosen: boolean;
  setExperienceMode: (mode: ExperienceMode) => void;
  setRotationUnit: (unit: RotationUnit) => void;
  setPositionStep: (step: number) => void;
  setConfirmUnsavedOnLeave: (value: boolean) => void;
  setShowShortcutHints: (value: boolean) => void;
  reset: () => void;
}

const DEFAULTS = {
  rotationUnit: 'deg' as RotationUnit,
  positionStep: 0.01,
  confirmUnsavedOnLeave: true,
  showShortcutHints: true,
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      setRotationUnit: (rotationUnit) => set({ rotationUnit }),
      setPositionStep: (positionStep) => set({ positionStep }),
      setConfirmUnsavedOnLeave: (confirmUnsavedOnLeave) => set({ confirmUnsavedOnLeave }),
      setShowShortcutHints: (showShortcutHints) => set({ showShortcutHints }),
      experienceMode: 'professional',
      experienceChosen: false,
      setExperienceMode: (experienceMode) => set({ experienceMode, experienceChosen: true }),
      // Workspace settings only: the experience mode is kept.
      reset: () => set(DEFAULTS),
    }),
    { name: 'arai.settings.v1', storage: safeStorage },
  ),
);
