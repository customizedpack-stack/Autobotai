import { useEffect } from 'react';
import { CAMERA_VIEWS } from '../features/viewport/cameraPresets';
import { deleteSelected, duplicateSelected, redo, saveCurrentProject, undo } from '../features/projects/workspaceActions';
import { useSelectionStore } from '../stores/selectionStore';
import { useViewportStore } from '../stores/viewportStore';

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/** Global keyboard shortcuts for the workspace. Inactive while typing in a field. */
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
      } else if (!mod && key === 'f') {
        useViewportStore.getState().requestFrame();
      } else if (!mod && !event.altKey && ['q', 'w', 'e', 'r'].includes(key)) {
        const modes = { q: 'select', w: 'translate', e: 'rotate', r: 'scale' } as const;
        useViewportStore.getState().setTransformMode(modes[key as keyof typeof modes]);
      } else if (!mod && key === 's') {
        useViewportStore.getState().toggleSnap();
      } else if (!mod && !event.altKey) {
        const view = CAMERA_VIEWS.find((v) => v.shortcut === key);
        if (view) useViewportStore.getState().requestView(view.id);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}
