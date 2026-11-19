import { useState } from 'react';
import { PanelLeftClose, PanelLeftOpen, Search, X } from 'lucide-react';
import { ComponentLibraryPanel } from '../../features/component-library/ComponentLibraryPanel';
import { RobotLibraryPanel, TemplatesPanel } from '../../features/robot-library/RobotLibraryPanel';
import { useRobotStateStore } from '../../stores/robotStateStore';
import { useSceneStore } from '../../stores/sceneStore';
import { useWorkspaceStore, type LeftPanelTab } from '../../stores/workspaceStore';
import { IconButton } from '../common/Button';
import { ObjectsPanel } from './ObjectsPanel';
import { CodeStudioSidePanel } from '../../features/code-studio/components/CodeStudioSidePanel';
import { EnvironmentLeftPanel } from '../../features/environment/components/EnvironmentLeftPanel';

const PLACEHOLDERS: Record<LeftPanelTab, string> = {
  components: 'Search components',
  library: 'Search robot library',
  templates: 'Search templates',
  objects: 'Search scene objects',
};

export function LeftPanel({ overlay = false }: { overlay?: boolean }) {
  const collapsed = useWorkspaceStore((s) => s.collapsed.left);
  const togglePanel = useWorkspaceStore((s) => s.togglePanel);
  const tab = useWorkspaceStore((s) => s.leftTab);
  const setTab = useWorkspaceStore((s) => s.setLeftTab);
  const objectCount = useSceneStore((s) => s.objects.length);
  const [query, setQuery] = useState('');
  const mode = useRobotStateStore((s) => s.mode);
  const control = mode === 'control';
  const code = mode === 'code';
  const locked = control && tab !== 'objects';

  const rail = (
    <div className="flex w-9 shrink-0 flex-col items-center border-r border-line bg-panel py-1.5" data-testid="left-panel-collapsed">
      <IconButton label="Expand left panel" onClick={() => togglePanel('left')}>
        <PanelLeftOpen size={15} />
      </IconButton>
      <span className="mt-3 text-[10px] tracking-widest text-faint uppercase [writing-mode:vertical-rl]">{code ? 'Programs' : 'Library'}</span>
    </div>
  );
  if (collapsed) return rail;

  const tabs: { id: LeftPanelTab; label: string }[] = [
    { id: 'components', label: 'Components' },
    { id: 'library', label: 'Library' },
    { id: 'templates', label: 'Templates' },
    { id: 'objects', label: `Objects ${objectCount}` },
  ];

  const codePanel = (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-line bg-panel" data-testid="left-panel" aria-label="Code Studio panel">
      <div className="flex h-9 items-center justify-between border-b border-line pr-1 pl-3">
        <span className="text-[11px] font-semibold tracking-wider text-muted uppercase">Code Studio</span>
        <IconButton label="Collapse left panel" onClick={() => togglePanel('left')}>
          <PanelLeftClose size={15} />
        </IconButton>
      </div>
      <CodeStudioSidePanel />
    </aside>
  );

  const environmentPanel = (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-line bg-panel" data-testid="left-panel" aria-label="Environment panel">
      <div className="flex h-9 items-center justify-between border-b border-line pr-1 pl-3">
        <span className="text-[11px] font-semibold tracking-wider text-muted uppercase">Environment</span>
        <IconButton label="Collapse left panel" onClick={() => togglePanel('left')}>
          <PanelLeftClose size={15} />
        </IconButton>
      </div>
      <EnvironmentLeftPanel />
    </aside>
  );

  const panel = mode === 'environment' ? environmentPanel : code ? codePanel : (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-line bg-panel" data-testid="left-panel" aria-label="Library panel">
      <div className="flex h-9 items-center justify-between border-b border-line pr-1 pl-3">
        <span className="text-[11px] font-semibold tracking-wider text-muted uppercase">Explorer</span>
        <IconButton label="Collapse left panel" onClick={() => togglePanel('left')}>
          <PanelLeftClose size={15} />
        </IconButton>
      </div>
      <div className="grid grid-cols-4 border-b border-line" role="tablist" aria-label="Library sections">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={
              tab === t.id
                ? 'h-8 border-b-2 border-accent text-[11px] font-medium text-ink'
                : 'h-8 border-b-2 border-transparent text-[11px] text-muted hover:text-ink'
            }
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="border-b border-line-soft p-2">
        <label className="flex h-7 items-center gap-1.5 rounded-md border border-line bg-app px-2 focus-within:border-accent">
          <Search size={13} className="text-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={PLACEHOLDERS[tab]}
            aria-label={PLACEHOLDERS[tab]}
            className="h-full min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-faint"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="text-faint hover:text-ink">
              <X size={12} />
            </button>
          )}
        </label>
      </div>
      {control && (
        <div className="border-b border-line-soft bg-warn/10 px-3 py-1.5 text-[11px] text-warn" data-testid="edit-lock">
          Editing is locked in Control Mode. Press M or choose Build to edit.
        </div>
      )}
      <div className={locked ? 'pointer-events-none min-h-0 flex-1 overflow-y-auto opacity-40' : 'min-h-0 flex-1 overflow-y-auto'} aria-disabled={locked}>
        {tab === 'components' && <ComponentLibraryPanel query={query} />}
        {tab === 'library' && <RobotLibraryPanel query={query} />}
        {tab === 'templates' && <TemplatesPanel query={query} />}
        {tab === 'objects' && <ObjectsPanel query={query} />}
      </div>
    </aside>
  );
  if (!overlay) return panel;
  // Compact screens: the panel slides over the viewport instead of shrinking it.
  return (
    <>
      {rail}
      <div className="absolute inset-0 z-20 bg-black/40" data-testid="left-drawer-backdrop" onClick={() => togglePanel('left')} />
      <div className="absolute inset-y-0 left-0 z-30 flex max-w-[85vw] shadow-2xl shadow-black/60" data-testid="left-drawer">
        {panel}
      </div>
    </>
  );
}
