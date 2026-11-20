import { create } from 'zustand';

/**
 * Runtime learning state for the open workspace (never saved).
 * Inspection has its OWN selection (inspectedId), separate from the Builder's selectionStore,
 * so Reverse Engineering never selects, moves or edits a part.
 */
interface LearningSessionState {
  projectId: string | null;
  tutorialId: string | null;
  inspecting: boolean;
  inspectedId: string | null;
  panelOpen: boolean;
  begin: (projectId: string, options: { tutorialId?: string | null; inspect?: boolean }) => void;
  end: () => void;
  setInspecting: (on: boolean) => void;
  inspect: (id: string | null) => void;
  setPanelOpen: (open: boolean) => void;
}

export const useLearningSession = create<LearningSessionState>((set) => ({
  projectId: null,
  tutorialId: null,
  inspecting: false,
  inspectedId: null,
  panelOpen: false,
  begin: (projectId, { tutorialId = null, inspect = false }) =>
    set({ projectId, tutorialId, inspecting: inspect, inspectedId: null, panelOpen: Boolean(tutorialId) || inspect }),
  end: () => set({ projectId: null, tutorialId: null, inspecting: false, inspectedId: null, panelOpen: false }),
  setInspecting: (on) => set((s) => ({ inspecting: on, inspectedId: on ? s.inspectedId : null, panelOpen: on || Boolean(s.tutorialId) ? true : s.panelOpen })),
  inspect: (inspectedId) => set({ inspectedId }),
  setPanelOpen: (panelOpen) => set({ panelOpen }),
}));
