import { useState } from 'react';
import { Plug, Plus, Trash2, Wand2 } from 'lucide-react';
import { Button } from '../../../components/common/Button';
import { EmptyState } from '../../../components/common/EmptyState';
import { cn } from '../../../utils/cn';
import { addStandardWiring, addWiring, removeWiring, updateWiring } from '../blueprintActions';
import { ISSUE_LABELS, endpoints } from '../engine/wiring';
import type { WireDirection, WireInterface, WiringRecord } from '../model/types';
import { Section } from './shared';
import { inputClass } from './format';
import type { BlueprintView } from './useBlueprintView';

const INTERFACES: WireInterface[] = ['power', 'ground', 'digital', 'pwm', 'analog', 'i2c-sda', 'i2c-scl', 'spi', 'uart-tx', 'uart-rx', 'motor'];
const DIRECTIONS: { id: WireDirection; label: string }[] = [
  { id: 'controller-to-component', label: 'Controller → part' },
  { id: 'component-to-controller', label: 'Part → controller' },
  { id: 'bidirectional', label: 'Both ways' },
  { id: 'power-supply', label: 'Power / ground' },
];

function WireRow({ w, view }: { w: WiringRecord; view: BlueprintView }) {
  const eps = endpoints(view.model, view.data);
  const issues = view.wiring.issues.filter((i) => i.recordId === w.id);
  const ok = view.wiring.drawable.has(w.id);
  return (
    <tr className={cn('border-t border-line-soft align-top', issues.some((i) => i.severity === 'error') && 'bg-err/5')} data-testid={`wire-${w.id}`} data-ok={ok}>
      <td className="px-1.5 py-1">
        <input className={cn(inputClass, 'w-20')} defaultValue={w.controllerPin} key={w.controllerPin} placeholder="Pin" onBlur={(e) => updateWiring(w.id, { controllerPin: e.target.value.slice(0, 40) })} data-testid={`wire-cpin-${w.id}`} aria-label="Controller or source pin" />
      </td>
      <td className="px-1.5 py-1">
        <select className={cn(inputClass, 'w-36')} value={w.componentRef} onChange={(e) => updateWiring(w.id, { componentRef: e.target.value })} aria-label="Component">
          {eps.map((e) => (
            <option key={e.ref} value={e.ref}>
              {e.name}
            </option>
          ))}
          {!eps.some((e) => e.ref === w.componentRef) && <option value={w.componentRef}>(removed component)</option>}
        </select>
      </td>
      <td className="px-1.5 py-1">
        <input className={cn(inputClass, 'w-16')} defaultValue={w.componentPin} key={w.componentPin} placeholder="Pin" onBlur={(e) => updateWiring(w.id, { componentPin: e.target.value.slice(0, 40) })} data-testid={`wire-ppin-${w.id}`} aria-label="Component pin" />
      </td>
      <td className="px-1.5 py-1">
        <select className={cn(inputClass, 'w-24')} value={w.interface} onChange={(e) => updateWiring(w.id, { interface: e.target.value as WireInterface })} aria-label="Interface">
          {INTERFACES.map((i) => (
            <option key={i} value={i}>
              {i}
            </option>
          ))}
        </select>
      </td>
      <td className="px-1.5 py-1">
        <input
          type="number"
          step="0.1"
          min={0}
          max={100}
          className={cn(inputClass, 'w-16')}
          defaultValue={w.voltage ?? ''}
          key={String(w.voltage)}
          placeholder="?"
          onBlur={(e) => updateWiring(w.id, { voltage: e.target.value === '' ? null : Number(e.target.value) })}
          data-testid={`wire-volt-${w.id}`}
          aria-label="Voltage"
        />
      </td>
      <td className="px-1.5 py-1">
        <select className={cn(inputClass, 'w-32')} value={w.direction} onChange={(e) => updateWiring(w.id, { direction: e.target.value as WireDirection })} aria-label="Direction">
          {DIRECTIONS.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
            </option>
          ))}
        </select>
      </td>
      <td className="px-1.5 py-1 text-[11px]">
        {issues.length === 0 ? <span className="text-ok">OK</span> : issues.map((i, n) => <p key={n} className={i.severity === 'error' ? 'text-err' : 'text-warn'} title={i.message}>{ISSUE_LABELS[i.kind]}</p>)}
        {w.notes && <p className="text-faint">{w.notes}</p>}
      </td>
      <td className="px-1.5 py-1">
        <button type="button" className="text-faint hover:text-err" onClick={() => removeWiring(w.id)} aria-label="Remove wire">
          <Trash2 size={12} />
        </button>
      </td>
    </tr>
  );
}

/** Overview diagram. Only fully specified wires with a known, checked voltage are drawn. */
function Diagram({ view }: { view: BlueprintView }) {
  const eps = endpoints(view.model, view.data);
  const wires = view.data.wiring.filter((w) => view.wiring.drawable.has(w.id));
  const controllerRef = view.wiring.controller ? `${view.wiring.controller.mapping.targetKind}:${view.wiring.controller.mapping.targetId}` : null;
  const refs = [...new Set(wires.flatMap((w) => [w.componentRef, w.sourceRef || controllerRef || '']).filter(Boolean))];
  const left = refs.filter((r) => r === controllerRef || wires.some((w) => w.sourceRef === r));
  const right = refs.filter((r) => !left.includes(r));
  const rowH = 46;
  const height = Math.max(left.length, right.length, 1) * rowH + 20;
  const pos = new Map<string, { x: number; y: number }>();
  left.forEach((r, i) => pos.set(r, { x: 20, y: 10 + i * rowH }));
  right.forEach((r, i) => pos.set(r, { x: 360, y: 10 + i * rowH }));
  const nameOf = (r: string) => eps.find((e) => e.ref === r)?.name ?? r;
  const color = (w: WiringRecord) => (w.interface === 'power' ? '#ef4444' : w.interface === 'ground' ? '#94a3b8' : w.interface === 'motor' ? '#f59e0b' : '#3b82f6');
  if (wires.length === 0)
    return (
      <p className="text-[11px] text-muted" data-testid="wiring-diagram-empty">
        No connection can be drawn yet. A wire is drawn only when both pins are named, its voltage is known and no problem is flagged on it.
      </p>
    );
  return (
    <svg viewBox={`0 0 560 ${height}`} className="w-full max-w-[640px]" role="img" aria-label="Wiring overview (not a verified schematic)" data-testid="wiring-diagram" data-wires={wires.length}>
      {wires.map((w) => {
        const a = pos.get(w.sourceRef || controllerRef || '');
        const b = pos.get(w.componentRef);
        if (!a || !b) return null;
        return (
          <g key={w.id}>
            <line x1={a.x + 180} y1={a.y + 15} x2={b.x} y2={b.y + 15} stroke={color(w)} strokeWidth={1.5} />
            <text x={(a.x + 180 + b.x) / 2} y={(a.y + b.y) / 2 + 12} fontSize={9} fill="#94a3b8" textAnchor="middle">
              {w.controllerPin}→{w.componentPin} {w.voltage} V
            </text>
          </g>
        );
      })}
      {[...pos.entries()].map(([r, p]) => (
        <g key={r}>
          <rect x={p.x} y={p.y} width={180} height={30} rx={5} fill="#1e232b" stroke="#303641" />
          <text x={p.x + 8} y={p.y + 19} fontSize={11} fill="#f1f5f9">
            {nameOf(r).slice(0, 26)}
          </text>
        </g>
      ))}
    </svg>
  );
}

export function WiringTab({ view }: { view: BlueprintView }) {
  const [message, setMessage] = useState<string | null>(null);
  const eps = endpoints(view.model, view.data);
  const errors = view.wiring.issues.filter((i) => i.severity === 'error');
  const globalIssues = view.wiring.issues.filter((i) => i.recordId === null);
  return (
    <div className="space-y-3" data-testid="wiring-tab">
      <p className="rounded border border-warn/30 bg-warn/5 p-2 text-[11px] text-warn">
        This wiring list is a planning aid, <b>not a verified schematic</b>. It is kept separate from the 3D model. Check every connection against the datasheets and measure voltages before powering on.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          icon={<Wand2 size={12} />}
          onClick={() => {
            const n = addStandardWiring();
            setMessage(n ? `Added ${n} starting wire(s). Controller pins are left empty for you to choose.` : 'No new standard wires: map a driver, sensor or regulator first, or they are already listed.');
          }}
          data-testid="wiring-standard"
        >
          Add standard wires for mapped parts
        </Button>
        <Button
          size="sm"
          icon={<Plus size={12} />}
          disabled={eps.length === 0}
          onClick={() => addWiring({ controllerPin: '', sourceRef: '', componentRef: eps[0]!.ref, componentPin: '', interface: 'digital', voltage: null, direction: 'controller-to-component', notes: '' })}
          data-testid="wiring-add"
        >
          Add wire
        </Button>
        {message && <span className="text-[11px] text-muted" data-testid="wiring-message">{message}</span>}
      </div>
      <Section title={`Wiring records (${view.data.wiring.length})`} testId="wiring-records">
        {view.data.wiring.length === 0 ? (
          <EmptyState icon={<Plug size={18} />} title="No wiring yet" description="Map parts first, then add the standard wires or add wires one by one." />
        ) : (
          <div className="overflow-auto">
            <table className="w-full min-w-[820px] text-[11.5px]">
              <thead className="text-left text-muted">
                <tr>
                  {['Controller / source pin', 'Component', 'Component pin', 'Interface', 'Voltage (V)', 'Direction', 'Check', ''].map((h) => (
                    <th key={h} className="px-1.5 py-1 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {view.data.wiring.map((w) => (
                  <WireRow key={w.id} w={w} view={view} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
      <Section title={`Wiring problems (${view.wiring.issues.length})`} testId="wiring-issues" actions={<span className={errors.length ? 'text-[11px] text-err' : 'text-[11px] text-muted'} data-testid="wiring-error-count" data-errors={errors.length}>{errors.length} error(s)</span>}>
        {view.wiring.issues.length === 0 ? (
          <p className="text-[11px] text-ok">No problems found in the listed wires.</p>
        ) : (
          <ul className="space-y-0.5 text-[11px]">
            {globalIssues.map((i, n) => (
              <li key={n} className={i.severity === 'error' ? 'text-err' : 'text-warn'} data-testid={`wiring-issue-${i.kind}`}>
                {ISSUE_LABELS[i.kind]}: {i.message}
              </li>
            ))}
            {view.wiring.issues
              .filter((i) => i.recordId !== null)
              .map((i, n) => (
                <li key={`r${n}`} className={i.severity === 'error' ? 'text-err' : 'text-warn'} data-testid={`wiring-issue-${i.kind}`}>
                  {ISSUE_LABELS[i.kind]}: {i.message}
                </li>
              ))}
          </ul>
        )}
      </Section>
      <Section title="Wiring overview" testId="wiring-overview">
        <Diagram view={view} />
      </Section>
    </div>
  );
}
