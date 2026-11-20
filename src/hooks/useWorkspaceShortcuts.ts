import { useEffect } from 'react';
import { toggleWorkspaceMode } from '../features/controls/controlSession';
import { CAMERA_VIEWS } from '../features/viewport/cameraPresets';
import { useRobotStateStore } from '../stores/robotStateStore';
import { useLearningSession } from '../features/learning/store/learningSession';
import { deleteSelected, duplicateSelected, redo, saveCurrentProject, undo } from '../features/projects/workspaceActions';
import { useSelectionStore } from '../stores/selectionStore';
import { saveActiveProgram } from '../features/code-studio/programActions';
import { useViewportStore } from '../stores/viewportStore';
import { duplicateObject, removeObject, selectObject, useEnvironmentStore } from '../features/environment/store/environmentStore';

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
      const mode = useRobotStateStore.getState().mode;
      if (mod && key === 's') {
        event.preventDefault();
        // Phase 11: Reverse Engineering inspection is read-only.
        if (useLearningSession.getState().inspecting) return;
        // In Code Studio the design is locked, so Ctrl+S saves the open program.
        if (mode === 'code') saveActiveProgram();
        else saveCurrentProject();
        return;
      }
      if (isTyping(event.target) || document.querySelector('[role="dialog"]')) return;
      // Keys pressed inside the Blockly or code editor belong to the editor.
      if (event.target instanceof Element && event.target.closest('[data-code-editor]')) return;
      const control = mode === 'control' || mode === 'code';
      const environment = mode === 'environment';

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
        if (environment) {
          const id = useEnvironmentStore.getState().selectedId;
          if (id) duplicateObject(id);
        } else duplicateSelected();
      } else if (!mod && (key === 'delete' || key === 'backspace')) {
        event.preventDefault();
        if (environment) {
          const id = useEnvironmentStore.getState().selectedId;
          if (id) removeObject(id);
        } else deleteSelected();
      } else if (key === 'escape') {
        if (environment) selectObject(null);
        else useSelectionStore.getState().clear();
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
