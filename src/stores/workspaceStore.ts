import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeStorage } from '../utils/storage';

export type LeftPanelTab = 'components' | 'library' | 'templates' | 'objects';
/** 'program' is the Code Studio execution console (shown in Code Studio only). */
export type BottomPanelTab = 'console' | 'events' | 'status' | 'program';
export type PanelId = 'left' | 'right' | 'bottom';

interface WorkspaceState {
  collapsed: Record<PanelId, boolean>;
  leftTab: LeftPanelTab;
  bottomTab: BottomPanelTab;
  togglePanel: (panel: PanelId) => void;
  setPanelCollapsed: (panel: PanelId, collapsed: boolean) => void;
  setLeftTab: (tab: LeftPanelTab) => void;
  setBottomTab: (tab: BottomPanelTab) => void;
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set) => ({
      collapsed: { left: false, right: false, bottom: false },
      leftTab: 'components',
      bottomTab: 'console',
      togglePanel: (panel) =>
        set((state) => ({ collapsed: { ...state.collapsed, [panel]: !state.collapsed[panel] } })),
      setPanelCollapsed: (panel, collapsed) =>
        set((state) => ({ collapsed: { ...state.collapsed, [panel]: collapsed } })),
      setLeftTab: (leftTab) => set({ leftTab }),
      setBottomTab: (bottomTab) => set({ bottomTab }),
    }),
    { name: 'arai.workspace.v1', storage: safeStorage },
  ),
);
