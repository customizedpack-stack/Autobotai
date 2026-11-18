import { create } from 'zustand';

/**
 * Editor session state for Code Studio (never saved).
 *
 * `drafts` holds unsaved edits per program. `baselines` holds the editor's own
 * representation of the saved program right after it was opened or saved
 * (Blockly re-serializes a loaded workspace with block ids, so the saved text
 * and the editor text can differ without any user change). A program is dirty
 * when its draft differs from its baseline.
 */
export type CodeView = 'editor' | 'generated';

interface CodeStudioState {
  activeProgramId: string | null;
  drafts: Record<string, string>;
  baselines: Record<string, string>;
  /** Blockly programs: show the blocks or the generated JavaScript. */
  view: CodeView;
  setActive: (programId: string | null) => void;
  setBaseline: (programId: string, source: string) => void;
  setDraft: (programId: string, source: string) => void;
  clearDraft: (programId: string) => void;
  clearAll: () => void;
  setView: (view: CodeView) => void;
}

export const useCodeStudioStore = create<CodeStudioState>((set) => ({
  activeProgramId: null,
  drafts: {},
  baselines: {},
  view: 'editor',
  setActive: (activeProgramId) => set({ activeProgramId, view: 'editor' }),
  setBaseline: (programId, source) => set((s) => ({ baselines: { ...s.baselines, [programId]: source } })),
  setDraft: (programId, source) => set((s) => ({ drafts: { ...s.drafts, [programId]: source } })),
  clearDraft: (programId) =>
    set((s) => {
      const drafts = { ...s.drafts };
      delete drafts[programId];
      return { drafts };
    }),
  clearAll: () => set({ activeProgramId: null, drafts: {}, baselines: {}, view: 'editor' }),
  setView: (view) => set({ view }),
}));

/** True when the program has edits that are not saved. */
export function isProgramDirty(state: Pick<CodeStudioState, 'drafts' | 'baselines'>, programId: string): boolean {
  const draft = state.drafts[programId];
  return draft !== undefined && draft !== state.baselines[programId];
}
