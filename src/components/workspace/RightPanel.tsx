import { PanelRightClose, PanelRightOpen } from 'lucide-react';
import { Inspector } from '../../features/inspector/Inspector';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { IconButton } from '../common/Button';

export function RightPanel() {
  const collapsed = useWorkspaceStore((s) => s.collapsed.right);
  const togglePanel = useWorkspaceStore((s) => s.togglePanel);

  if (collapsed) {
    return (
      <div className="flex w-9 shrink-0 flex-col items-center border-l border-line bg-panel py-1.5" data-testid="right-panel-collapsed">
        <IconButton label="Expand properties panel" onClick={() => togglePanel('right')}>
          <PanelRightOpen size={15} />
        </IconButton>
        <span className="mt-3 text-[10px] tracking-widest text-faint uppercase [writing-mode:vertical-rl]">Properties</span>
      </div>
    );
  }

  return (
    <aside className="flex w-72 shrink-0 flex-col border-l border-line bg-panel" data-testid="right-panel" aria-label="Properties panel">
      <div className="flex h-9 items-center justify-between border-b border-line pr-1 pl-3">
        <span className="text-[11px] font-semibold tracking-wider text-muted uppercase">Properties</span>
        <IconButton label="Collapse properties panel" onClick={() => togglePanel('right')}>
          <PanelRightClose size={15} />
        </IconButton>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Inspector />
      </div>
    </aside>
  );
}
