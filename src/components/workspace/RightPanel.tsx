import { PanelRightClose, PanelRightOpen } from 'lucide-react';
import { Inspector } from '../../features/inspector/Inspector';
import { useRobotStateStore } from '../../stores/robotStateStore';
import { RobotControlPanel } from './RobotControlPanel';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { IconButton } from '../common/Button';

export function RightPanel({ overlay = false }: { overlay?: boolean }) {
  const collapsed = useWorkspaceStore((s) => s.collapsed.right);
  const togglePanel = useWorkspaceStore((s) => s.togglePanel);
  const control = useRobotStateStore((s) => s.mode === 'control');

  const rail = (
    <div className="flex w-9 shrink-0 flex-col items-center border-l border-line bg-panel py-1.5" data-testid="right-panel-collapsed">
      <IconButton label="Expand properties panel" onClick={() => togglePanel('right')}>
        <PanelRightOpen size={15} />
      </IconButton>
      <span className="mt-3 text-[10px] tracking-widest text-faint uppercase [writing-mode:vertical-rl]">{control ? 'Control' : 'Properties'}</span>
    </div>
  );
  if (collapsed) return rail;

  const panel = (
    <aside className="flex h-full w-72 shrink-0 flex-col border-l border-line bg-panel" data-testid="right-panel" aria-label="Properties panel">
      <div className="flex h-9 items-center justify-between border-b border-line pr-1 pl-3">
        <span className="text-[11px] font-semibold tracking-wider text-muted uppercase">{control ? 'Robot Control' : 'Properties'}</span>
        <IconButton label="Collapse properties panel" onClick={() => togglePanel('right')}>
          <PanelRightClose size={15} />
        </IconButton>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {control ? <RobotControlPanel /> : <Inspector />}
      </div>
    </aside>
  );
  if (!overlay) return panel;
  // Compact screens: the panel slides over the viewport instead of shrinking it.
  return (
    <>
      {rail}
      <div className="absolute inset-0 z-20 bg-black/40" data-testid="right-drawer-backdrop" onClick={() => togglePanel('right')} />
      <div className="absolute inset-y-0 right-0 z-30 flex max-w-[85vw] shadow-2xl shadow-black/60" data-testid="right-drawer">
        {panel}
      </div>
    </>
  );
}
