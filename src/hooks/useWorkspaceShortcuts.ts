import { useEffect } from 'react';
import { toggleWorkspaceMode } from '../features/controls/controlSession';
import { CAMERA_VIEWS } from '../features/viewport/cameraPresets';
import { useRobotStateStore } from '../stores/robotStateStore';
import { deleteSelected, duplicateSelected, redo, saveCurrentProject, undo } from '../features/projects/workspaceActions';
import { useSelectionStore } from '../stores/selectionStore';
import { useViewportStore } from '../stores/viewportStore';

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/**
 * Global keyboard shortcuts for the workspace. Inactive while typing in a field.
 * In Control Mode the editing shortcuts (undo, delete, duplicate, Q/W/E/R/S tools)
 * are off: W/A/S/D/R/Space drive the robot instead (see useRobotKeyboard).
 * Save, camera views (1–6), frame (F) and the mode toggle (M) work in both modes.
 */
export function useWorkspaceShortcuts(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();

      // Save works everywhere, even inside inputs.
      if (mod && key === 's') {
        event.preventDefault();
        saveCurrentProject();
        return;
      }
      if (isTyping(event.target) || document.querySelector('[role="dialog"]')) return;
      const control = useRobotStateStore.getState().mode === 'control';

      if (!mod && !event.altKey && key === 'm') {
        toggleWorkspaceMode();
        return;
      }
      if (!mod && key === 'f') {
        useViewportStore.getState().requestFrame();
        return;
      }
      if (!mod && !event.altKey) {
        const view = CAMERA_VIEWS.find((v) => v.shortcut === key);
        if (view) {
          useViewportStore.getState().requestView(view.id);
          return;
        }
      }
      if (control) return;

      if (mod && key === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (mod && key === 'y') {
        event.preventDefault();
        redo();
      } else if (mod && key === 'd') {
        event.preventDefault();
        duplicateSelected();
      } else if (!mod && (key === 'delete' || key === 'backspace')) {
        event.preventDefault();
        deleteSelected();
      } else if (key === 'escape') {
        useSelectionStore.getState().clear();
      } else if (!mod && !event.altKey && ['q', 'w', 'e', 'r'].includes(key)) {
        const modes = { q: 'select', w: 'translate', e: 'rotate', r: 'scale' } as const;
        useViewportStore.getState().setTransformMode(modes[key as keyof typeof modes]);
      } else if (!mod && key === 's') {
        useViewportStore.getState().toggleSnap();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}
