import { useMemo, useState } from 'react';
import { History } from 'lucide-react';
import { Button } from '../../../components/common/Button';
import { EmptyState } from '../../../components/common/EmptyState';
import { dataOf, useBlueprintStore } from '../blueprintStore';
import { compareData, isEmptyDiff } from '../engine/history';
import type { HistoryEventType } from '../model/types';
import { Section } from './shared';
import { formatTime, inputClass } from './format';
import type { BlueprintView } from './useBlueprintView';

const TYPE_LABEL: Record<HistoryEventType, string> = {
  'blueprint.created': 'Blueprint created',
  'component.added': 'Component added',
  'component.removed': 'Component removed',
  'part.mapped': 'Part mapped',
  'part.replaced': 'Part replaced',
  'part.unmapped': 'Part removed',
  'hardware.added': 'Hardware item added',
  'hardware.removed': 'Hardware item removed',
  'joint.changed': 'Joint changed',
  'motor.changed': 'Motor changed',
  'motor.assigned': 'Motor driver assigned',
  'sensor.changed': 'Sensor changed',
  'wiring.updated': 'Wiring updated',
  'program.changed': 'Program changed',
  'simulation.completed': 'Simulation test completed',
  'bom.generated': 'BOM generated',
  'bom.updated': 'BOM updated',
  'guide.generated': 'Guide generated',
  'guide.updated': 'Guide updated',
  'step.status': 'Step completed',
  'snapshot.created': 'Version saved',
  'snapshot.restored': 'Version restored',
  undo: 'Undo',
  redo: 'Redo',
};

export function HistoryTab({ view }: { view: BlueprintView }) {
  const [label, setLabel] = useState('');
  const [filter, setFilter] = useState<'all' | HistoryEventType>('all');
  const [comparing, setComparing] = useState<string | null>(null);
  const { history, snapshots } = view.blueprint;
  const unsaved = useBlueprintStore((s) => s.unsavedEvents);
  const events = useMemo(() => [...history].reverse().filter((e) => filter === 'all' || e.type === filter), [history, filter]);
  const nameOf = (ref: string) => view.vcs.find((v) => v.ref === ref)?.name ?? ref;
  const snap = snapshots.find((s) => s.id === comparing);
  const diff = snap ? compareData(snap.data, dataOf(view.blueprint), nameOf) : null;

  return (
    <div className="space-y-3" data-testid="history-tab">
      {unsaved > 0 && (
        <p className="rounded border border-warn/30 bg-warn/5 p-2 text-[11px] text-warn" data-testid="history-unsaved">
          {unsaved} event(s) are not saved yet. Click Save in the top bar to keep them; leaving without saving asks first.
        </p>
      )}
      <Section
        title={`Versions (${snapshots.length})`}
        testId="history-snapshots"
        actions={
          <form
            className="flex gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              useBlueprintStore.getState().createSnapshot(label);
              setLabel('');
            }}
          >
            <input className={inputClass} value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} placeholder="Version name" data-testid="snapshot-label" aria-label="Version name" />
            <Button size="sm" type="submit" data-testid="snapshot-create">
              Save version
            </Button>
          </form>
        }
      >
        {snapshots.length === 0 ? (
          <p className="text-[11px] text-muted">Save a version to compare or restore the blueprint later. Versions hold blueprint data only (mappings, wiring, BOM extras, guide); restoring never changes the 3D robot model.</p>
        ) : (
          <ul className="space-y-1">
            {[...snapshots].reverse().map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2 text-[12px]" data-testid="snapshot">
                <span className="font-medium">{s.label}</span>
                <span className="text-[11px] text-muted">{formatTime(s.createdAt)} · {s.data.mappings.length} mappings · {s.data.wiring.length} wires</span>
                <div className="ml-auto flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setComparing(comparing === s.id ? null : s.id)} data-testid={`snapshot-compare-${s.id}`}>
                    {comparing === s.id ? 'Hide comparison' : 'Compare with current'}
                  </Button>
                  <Button size="sm" onClick={() => useBlueprintStore.getState().restoreSnapshot(s.id)} data-testid={`snapshot-restore-${s.id}`} title="Restores blueprint data only; can be undone">
                    Restore
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {diff && (
          <div className="mt-2 rounded border border-line-soft bg-app p-2 text-[11px]" data-testid="snapshot-diff">
            {isEmptyDiff(diff) ? (
              <p className="text-muted">No differences.</p>
            ) : (
              <>
                {diff.mappings.map((m) => (
                  <p key={m.target}>
                    {m.target}: {m.before ?? '—'} → {m.after ?? '—'}
                  </p>
                ))}
                {diff.hardware.map((h) => (
                  <p key={h.name}>
                    Hardware {h.change}: {h.name}
                  </p>
                ))}
                {diff.extras.map((e) => (
                  <p key={e.name}>
                    BOM extra {e.change}: {e.name}
                  </p>
                ))}
                {diff.wiring.added + diff.wiring.removed + diff.wiring.changed > 0 && (
                  <p>
                    Wiring: {diff.wiring.added} added, {diff.wiring.removed} removed, {diff.wiring.changed} changed
                  </p>
                )}
                {diff.steps.length > 0 && <p>Guide: {diff.steps.length} step status change(s)</p>}
              </>
            )}
          </div>
        )}
      </Section>
      <Section
        title={`Build History (${history.length})`}
        testId="history-events"
        actions={
          <select className={inputClass} value={filter} onChange={(e) => setFilter(e.target.value as 'all' | HistoryEventType)} aria-label="Filter events" data-testid="history-filter">
            <option value="all">All events</option>
            {Object.entries(TYPE_LABEL).map(([id, l]) => (
              <option key={id} value={id}>
                {l}
              </option>
            ))}
          </select>
        }
      >
        {events.length === 0 ? (
          <EmptyState icon={<History size={18} />} title="No events" description="Design changes, part mappings, wiring, BOM and guide updates appear here." />
        ) : (
          <ol className="max-h-[480px] space-y-1 overflow-auto" data-testid="history-list">
            {events.map((e) => (
              <li key={e.id} className="grid grid-cols-[150px_1fr] gap-2 border-b border-line-soft pb-1 text-[11.5px]" data-testid="history-event" data-type={e.type}>
                <span className="text-[10.5px] text-faint">{formatTime(e.timestamp)}</span>
                <span>
                  <b>{TYPE_LABEL[e.type]}</b> · {e.component}
                  {(e.previous || e.next) && (
                    <span className="text-muted">
                      {' '}
                      ({e.previous || '—'} → {e.next || '—'})
                    </span>
                  )}
                  {e.note && <span className="block text-[10.5px] text-muted">{e.note}</span>}
                </span>
              </li>
            ))}
          </ol>
        )}
        <p className="mt-1 text-[10.5px] text-faint">Up to 1000 events are kept. Physics frames and sensor readings are never recorded. History is saved with the project.</p>
      </Section>
    </div>
  );
}
