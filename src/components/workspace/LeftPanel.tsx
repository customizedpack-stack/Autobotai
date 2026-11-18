import { useState } from 'react';
import { PanelLeftClose, PanelLeftOpen, Search, X } from 'lucide-react';
import { ComponentLibraryPanel } from '../../features/component-library/ComponentLibraryPanel';
import { RobotLibraryPanel, TemplatesPanel } from '../../features/robot-library/RobotLibraryPanel';
import { useSceneStore } from '../../stores/sceneStore';
import { useWorkspaceStore, type LeftPanelTab } from '../../stores/workspaceStore';
import { IconButton } from '../common/Button';
import { ObjectsPanel } from './ObjectsPanel';

const PLACEHOLDERS: Record<LeftPanelTab, string> = {
  components: 'Search components',
  library: 'Search robot library',
  templates: 'Search templates',
  objects: 'Search scene objects',
};

export function LeftPanel() {
  const collapsed = useWorkspaceStore((s) => s.collapsed.left);
  const togglePanel = useWorkspaceStore((s) => s.togglePanel);
  const tab = useWorkspaceStore((s) => s.leftTab);
  const setTab = useWorkspaceStore((s) => s.setLeftTab);
  const objectCount = useSceneStore((s) => s.objects.length);
  const [query, setQuery] = useState('');

  if (collapsed) {
    return (
      <div className="flex w-9 shrink-0 flex-col items-center border-r border-line bg-panel py-1.5" data-testid="left-panel-collapsed">
        <IconButton label="Expand left panel" onClick={() => togglePanel('left')}>
          <PanelLeftOpen size={15} />
        </IconButton>
        <span className="mt-3 text-[10px] tracking-widest text-faint uppercase [writing-mode:vertical-rl]">Library</span>
      </div>
    );
  }

  const tabs: { id: LeftPanelTab; label: string }[] = [
    { id: 'components', label: 'Components' },
    { id: 'library', label: 'Library' },
    { id: 'templates', label: 'Templates' },
    { id: 'objects', label: `Objects ${objectCount}` },
  ];

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-line bg-panel" data-testid="left-panel" aria-label="Library panel">
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
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === 'components' && <ComponentLibraryPanel query={query} />}
        {tab === 'library' && <RobotLibraryPanel query={query} />}
        {tab === 'templates' && <TemplatesPanel query={query} />}
        {tab === 'objects' && <ObjectsPanel query={query} />}
      </div>
    </aside>
  );
}
