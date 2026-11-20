import { useState, type ReactNode } from 'react';
import { Box, Camera, Code2, Gamepad2, Gauge, Shapes, Trees } from 'lucide-react';
import { Button } from '../../../components/common/Button';
import { useSelectionStore } from '../../../stores/selectionStore';
import { useViewportStore } from '../../../stores/viewportStore';
import { useWorkspaceStore, type BottomPanelTab } from '../../../stores/workspaceStore';
import { cn } from '../../../utils/cn';
import { setWorkspaceMode } from '../../controls/controlSession';
import { useBlueprintStore } from '../blueprintStore';
import { summarize } from '../engine/compatibility';
import { guideProgress } from '../engine/guide';
import type { WorkspaceMode } from '../../../stores/robotStateStore';
import { BomTab } from './BomTab';
import { CompatibilityTab } from './CompatibilityTab';
import { GuideTab } from './GuideTab';
import { HistoryTab } from './HistoryTab';
import { HardwareTab } from '../../hardware/components/HardwareTab';
import { CONNECTION_LABELS, connectionState, useHardwareStore } from '../../hardware/hardwareStore';
import { PartsTab } from './PartsTab';
import { Section, StatusBadge } from './shared';
import { useBlueprintView, type BlueprintView } from './useBlueprintView';
import { WiringTab } from './WiringTab';

type TabId = 'overview' | 'robot' | 'parts' | 'compatibility' | 'wiring' | 'bom' | 'guide' | 'history' | 'hardware';

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'robot', label: '3D Robot' },
  { id: 'parts', label: 'Real Parts' },
  { id: 'compatibility', label: 'Compatibility' },
  { id: 'wiring', label: 'Wiring' },
  { id: 'bom', label: 'BOM' },
  { id: 'guide', label: 'Build Guide' },
  { id: 'history', label: 'Build History' },
  { id: 'hardware', label: 'Hardware' },
];

function go(mode: WorkspaceMode, bottom?: BottomPanelTab) {
  setWorkspaceMode(mode);
  if (bottom) {
    const ws = useWorkspaceStore.getState();
    ws.setBottomTab(bottom);
    ws.setPanelCollapsed('bottom', false);
  }
}

const NAV: { label: string; icon: ReactNode; testId: string; run: () => void }[] = [
  { label: 'Build', icon: <Shapes size={12} />, testId: 'bp-nav-build', run: () => go('build') },
  { label: 'Control', icon: <Gamepad2 size={12} />, testId: 'bp-nav-control', run: () => go('control') },
  { label: 'Code Studio', icon: <Code2 size={12} />, testId: 'bp-nav-code', run: () => go('code') },
  { label: 'Environment Editor', icon: <Trees size={12} />, testId: 'bp-nav-environment', run: () => go('environment') },
  { label: 'Camera Monitor', icon: <Camera size={12} />, testId: 'bp-nav-camera', run: () => go('control', 'camera') },
  { label: 'Sensor Monitor', icon: <Gauge size={12} />, testId: 'bp-nav-sensors', run: () => go('control', 'sensors') },
];

function Overview({ view, open }: { view: BlueprintView; open: (t: TabId) => void }) {
  const counts = summarize(view.checks);
  const mapped = view.vcs.filter((v) => v.mapping).length;
  const progress = guideProgress(view.guide, view.data.guide.steps);
  const hwState = useHardwareStore((s) => connectionState(s));
  const hwSimulated = useHardwareStore((s) => s.method === 'simulated' && s.phase !== 'idle');
  const weights = view.data.mappings.filter((m) => !view.orphans.includes(m));
  const knownWeight = weights.reduce((n, m) => n + (m.snapshot.specs.weightG ?? 0) * m.quantity, 0);
  const unknownWeight = weights.filter((m) => m.snapshot.specs.weightG === undefined).length;
  const cards: { label: string; value: string; detail: string; tab: TabId; testId: string }[] = [
    { label: 'Real parts', value: `${mapped} / ${view.vcs.length}`, detail: 'components mapped', tab: 'parts', testId: 'ov-parts' },
    { label: 'Compatibility', value: `${counts.incompatible} incompatible`, detail: `${counts.warning} warnings · ${counts.unknown} unknown · ${counts.compatible} compatible`, tab: 'compatibility', testId: 'ov-compat' },
    { label: 'Wiring', value: `${view.data.wiring.length} wires`, detail: `${view.wiring.issues.filter((i) => i.severity === 'error').length} errors · ${view.wiring.drawable.size} drawable`, tab: 'wiring', testId: 'ov-wiring' },
    { label: 'BOM', value: view.bom.requiredTotal !== null ? `US$${view.bom.requiredTotal.toFixed(2)}` : `${view.bom.lines.length} lines`, detail: view.bom.requiredTotal !== null ? 'required total (list prices)' : `total not shown: ${view.bom.unpricedRequired} line(s) without a verified price`, tab: 'bom', testId: 'ov-bom' },
    { label: 'Build Guide', value: view.data.guide.generatedAt ? `${progress.completed} / ${view.guide.length}` : 'Not generated', detail: view.data.guide.generatedAt ? 'steps completed' : 'generate it in the Build Guide tab', tab: 'guide', testId: 'ov-guide' },
    { label: 'Build History', value: `${view.blueprint.history.length} events`, detail: `${view.blueprint.snapshots.length} saved version(s)`, tab: 'history', testId: 'ov-history' },
    { label: 'Hardware', value: CONNECTION_LABELS[hwState], detail: view.data.hardwareProfile ? `Explorer Bot reference profile${hwSimulated ? ' · simulated device' : ''}` : 'No hardware profile selected', tab: 'hardware', testId: 'ov-hardware' },
  ];
  return (
    <div className="space-y-3" data-testid="blueprint-overview">
      <p className="text-[12px] text-muted">
        The Robot Blueprint turns the simulated robot into a real-world build plan: real parts with verified datasheet values, compatibility checks, wiring, a bill of materials and a build guide. It never changes the 3D model or the simulation.
      </p>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((c) => (
          <button key={c.label} type="button" onClick={() => open(c.tab)} className="rounded-lg border border-line bg-panel-2 p-3 text-left hover:border-accent/50" data-testid={c.testId}>
            <p className="text-[10.5px] tracking-wide text-muted uppercase">{c.label}</p>
            <p className="mt-0.5 text-[15px] font-semibold">{c.value}</p>
            <p className="text-[11px] text-muted">{c.detail}</p>
          </button>
        ))}
      </div>
      <p className="text-[11px] text-muted" data-testid="ov-weight">
        Weight of mapped parts with a stated weight: {Math.round(knownWeight * 10) / 10} g{unknownWeight > 0 ? ` (${unknownWeight} mapped part(s) have no stated weight and are not counted)` : ''}.
      </p>
      {view.catalog && view.catalog.rejected.length > 0 && <p className="text-[11px] text-warn">{view.catalog.rejected.length} catalog entr(ies) failed validation and are hidden.</p>}
      <p className="text-[11px] text-faint">No hardware is contacted and nothing leaves this browser. Hardware deployment is not part of this phase.</p>
    </div>
  );
}

function RobotTab({ view }: { view: BlueprintView }) {
  const selected = useSelectionStore((s) => s.selectedId);
  const components = view.vcs.filter((v) => v.kind === 'component');
  return (
    <Section title="3D robot components" testId="blueprint-robot">
      <p className="mb-2 text-[11px] text-muted">The 3D view beside this panel is the live robot model. Select a component to highlight it. Editing is done in Build Mode.</p>
      <ul className="space-y-1">
        {components.map((vc) => (
          <li key={vc.id}>
            <button
              type="button"
              onClick={() => {
                useSelectionStore.getState().select(vc.id);
                useViewportStore.getState().requestFrame();
              }}
              className={cn('flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[12px] hover:bg-raised', selected === vc.id && 'bg-accent-soft')}
              data-testid={`bp-robot-${vc.id}`}
            >
              <Box size={12} className="text-muted" />
              <span className="font-medium">{vc.name}</span>
              <span className="text-[11px] text-muted">{vc.category}</span>
              <span className="ml-auto truncate text-[11px] text-muted">{vc.mapping ? vc.mapping.snapshot.name : 'No real part'}</span>
              {vc.mapping && <StatusBadge status={view.byMapping.get(vc.mapping.id) ?? 'unknown'} />}
            </button>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export default function BlueprintPane() {
  const [tab, setTab] = useState<TabId>('overview');
  const view = useBlueprintView();
  const dropped = useBlueprintStore((s) => s.droppedOnLoad);
  const counts = summarize(view.checks);
  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-panel lg:w-[60%] lg:flex-none" data-testid="blueprint-pane">
      <header className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
        <h2 className="text-[13px] font-semibold">Robot Blueprint</h2>
        <span className="text-[11px] text-muted" data-testid="bp-header-status">
          {counts.incompatible > 0 ? `${counts.incompatible} incompatible` : 'No incompatibility'} · {counts.warning} warnings
        </span>
        <nav className="ml-auto flex flex-wrap gap-1" aria-label="Go to">
          {NAV.map((n) => (
            <Button key={n.testId} size="sm" variant="ghost" icon={n.icon} onClick={n.run} data-testid={n.testId}>
              <span className="hidden xl:inline">{n.label}</span>
              <span className="sr-only xl:hidden">{n.label}</span>
            </Button>
          ))}
        </nav>
      </header>
      <div role="tablist" aria-label="Blueprint sections" className="flex shrink-0 gap-0.5 overflow-x-auto border-b border-line px-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn('relative h-8 shrink-0 px-2.5 text-xs font-medium', tab === t.id ? 'text-ink' : 'text-muted hover:text-ink')}
            data-testid={`bp-tab-${t.id}`}
          >
            {t.label}
            {tab === t.id && <span className="absolute inset-x-1.5 bottom-0 h-0.5 rounded-full bg-accent" />}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3" data-testid={`bp-panel-${tab}`}>
        {dropped > 0 && <p className="mb-2 text-[11px] text-warn">{dropped} invalid saved blueprint entr(ies) were skipped while loading.</p>}
        {tab === 'overview' && <Overview view={view} open={setTab} />}
        {tab === 'robot' && <RobotTab view={view} />}
        {tab === 'parts' && <PartsTab view={view} />}
        {tab === 'compatibility' && <CompatibilityTab view={view} />}
        {tab === 'wiring' && <WiringTab view={view} />}
        {tab === 'bom' && <BomTab view={view} />}
        {tab === 'guide' && <GuideTab view={view} />}
        {tab === 'history' && <HistoryTab view={view} />}
        {tab === 'hardware' && <HardwareTab />}
      </div>
    </section>
  );
}
