import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeStorage } from '../utils/storage';

export type RotationUnit = 'deg' | 'rad';

interface SettingsState {
  rotationUnit: RotationUnit;
  /** Step used by the arrow keys in position fields, in meters. */
  positionStep: number;
  confirmUnsavedOnLeave: boolean;
  showShortcutHints: boolean;
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
      reset: () => set(DEFAULTS),
    }),
    { name: 'arai.settings.v1', storage: safeStorage },
  ),
);
