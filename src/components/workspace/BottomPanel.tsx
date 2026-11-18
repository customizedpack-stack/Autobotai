import { ChevronDown, ChevronUp, Trash } from 'lucide-react';
import { ConsoleLevelFilters, ConsoleView, EventsView } from '../../features/console/ConsoleView';
import { StatusView } from '../../features/console/StatusView';
import { useConsoleStore } from '../../stores/consoleStore';
import { useWorkspaceStore, type BottomPanelTab } from '../../stores/workspaceStore';
import { IconButton } from '../common/Button';
import { Tabs } from '../common/Tabs';

export function BottomPanel() {
  const collapsed = useWorkspaceStore((s) => s.collapsed.bottom);
  const togglePanel = useWorkspaceStore((s) => s.togglePanel);
  const setPanelCollapsed = useWorkspaceStore((s) => s.setPanelCollapsed);
  const tab = useWorkspaceStore((s) => s.bottomTab);
  const setTab = useWorkspaceStore((s) => s.setBottomTab);
  const entryCount = useConsoleStore((s) => s.entries.length);
  const eventCount = useConsoleStore((s) => s.events.length);
  const clear = useConsoleStore((s) => s.clear);
  const clearEvents = useConsoleStore((s) => s.clearEvents);

  const tabs = [
    { id: 'console' as const, label: 'Console', count: entryCount },
    { id: 'events' as const, label: 'Bus Events', count: eventCount },
    { id: 'status' as const, label: 'Status' },
  ];

  return (
    <section
      className={collapsed ? 'shrink-0 border-t border-line bg-panel' : 'flex h-40 shrink-0 flex-col border-t border-line bg-panel lg:h-56'}
      data-testid={collapsed ? 'bottom-panel-collapsed' : 'bottom-panel'}
      aria-label="Console panel"
    >
      <div className="flex h-8 shrink-0 items-stretch justify-between border-b border-line-soft pr-1">
        <Tabs<BottomPanelTab>
          ariaLabel="Console sections"
          items={tabs}
          value={tab}
          onChange={(next) => {
            setTab(next);
            setPanelCollapsed('bottom', false);
          }}
        />
        <div className="flex items-center gap-2">
          {!collapsed && tab === 'console' && (
            <div className="hidden md:block">
              <ConsoleLevelFilters />
            </div>
          )}
          {!collapsed && tab !== 'status' && (
            <IconButton label={tab === 'console' ? 'Clear console' : 'Clear events'} onClick={tab === 'console' ? clear : clearEvents}>
              <Trash size={13} />
            </IconButton>
          )}
          <IconButton label={collapsed ? 'Expand console panel' : 'Collapse console panel'} onClick={() => togglePanel('bottom')}>
            {collapsed ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </IconButton>
        </div>
      </div>
      {!collapsed && (
        <div className="min-h-0 flex-1">
          {tab === 'console' && <ConsoleView />}
          {tab === 'events' && <EventsView />}
          {tab === 'status' && <StatusView />}
        </div>
      )}
    </section>
  );
}
