import { useState } from 'react';
import { Download, FileText, Plus, Printer, Trash2 } from 'lucide-react';
import { Button } from '../../../components/common/Button';
import { useSceneStore } from '../../../stores/sceneStore';
import { cn } from '../../../utils/cn';
import { log } from '../../../utils/logger';
import { addExtra, markBomGenerated, removeExtra, updateExtra } from '../blueprintActions';
import { PRICE_NOTICE, bomToCsv, type Bom } from '../engine/bom';
import { DocLink, Section, StatusBadge } from './shared';
import { formatTime, inputClass } from './format';
import type { BlueprintView } from './useBlueprintView';

const usd = (n: number | null) => (n === null ? '—' : `US$${n.toFixed(2)}`);

function downloadCsv(bom: Bom) {
  const name = useSceneStore.getState().projectName || 'robot';
  const csv = bomToCsv(bom, name, new Date().toISOString());
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name.replace(/[^\w-]+/g, '_').slice(0, 60)}-bom.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  log.success('blueprint', `Exported the BOM as CSV (${bom.lines.length} lines).`);
}

export function BomTab({ view }: { view: BlueprintView }) {
  const { bom, data } = view;
  const [name, setName] = useState('');
  const [qty, setQty] = useState(1);
  const [required, setRequired] = useState(true);
  const generated = data.bomGeneratedAt;

  return (
    <div className="space-y-3" data-testid="bom-tab">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant={generated ? 'secondary' : 'primary'} icon={<FileText size={12} />} onClick={markBomGenerated} data-testid="bom-generate">
          {generated ? 'Regenerate BOM' : 'Generate BOM'}
        </Button>
        <Button size="sm" icon={<Download size={12} />} onClick={() => downloadCsv(bom)} disabled={bom.lines.length === 0} data-testid="bom-csv">
          Export CSV
        </Button>
        <Button size="sm" icon={<Printer size={12} />} onClick={() => window.print()} disabled={bom.lines.length === 0} data-testid="bom-print" title="Opens the browser print dialog; choose “Save as PDF” to get a PDF.">
          Print / Save as PDF
        </Button>
        <span className="text-[11px] text-muted">{generated ? `Generated ${formatTime(generated)}. The table updates live as mappings change.` : 'The table below updates live; Generate records a BOM version in Build History.'}</span>
      </div>
      <p className="rounded border border-line-soft bg-app p-2 text-[11px] text-muted" data-testid="bom-notice">
        {PRICE_NOTICE}
      </p>

      <div className="print-area overflow-auto rounded-lg border border-line" data-testid="bom-table-wrap">
        <table className="w-full min-w-[760px] text-[11.5px]" data-testid="bom-table">
          <thead className="bg-panel-2 text-left text-muted">
            <tr>
              {['Part', 'Manufacturer', 'Model', 'Qty', 'Unit price', 'Total', 'Links', 'Compatibility', 'Notes', ''].map((h) => (
                <th key={h} className="px-2 py-1.5 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {bom.lines.length === 0 && (
              <tr>
                <td colSpan={10} className="px-2 py-4 text-center text-muted">
                  No parts yet. Map real parts or add extra hardware below.
                </td>
              </tr>
            )}
            {bom.lines.map((l) => {
              const extraId = l.source === 'extra' ? l.key.slice('extra:'.length) : null;
              return (
                <tr key={l.key} className="border-t border-line-soft align-top" data-testid="bom-line" data-name={l.name} data-required={l.required}>
                  <td className="px-2 py-1.5">
                    <p className="font-medium">{l.name}</p>
                    <p className="text-[10.5px] text-faint">{l.required ? 'Required' : 'Optional'} · {l.usedFor.join(', ')}</p>
                  </td>
                  <td className="px-2 py-1.5">{l.manufacturer}</td>
                  <td className="px-2 py-1.5 font-mono">{l.model}</td>
                  <td className="px-2 py-1.5 font-mono">
                    {extraId ? (
                      <input type="number" min={1} className={cn(inputClass, 'w-14')} defaultValue={l.quantity} key={l.quantity} onBlur={(e) => updateExtra(extraId, { quantity: Number(e.target.value) })} aria-label={`Quantity of ${l.name}`} />
                    ) : (
                      <span data-testid="bom-qty">{l.quantity}</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 font-mono">{l.unitPrice !== null ? <span title={`List price checked ${l.priceCheckedAt}`}>{usd(l.unitPrice)}</span> : <span className="text-faint">Unknown</span>}</td>
                  <td className="px-2 py-1.5 font-mono">{usd(l.total)}</td>
                  <td className="space-y-0.5 px-2 py-1.5 text-[11px]">
                    {l.productUrl ? <DocLink href={l.productUrl}>Product</DocLink> : <span className="block text-faint">No product link</span>}
                    {l.datasheetUrl && <DocLink href={l.datasheetUrl}>Datasheet</DocLink>}
                  </td>
                  <td className="px-2 py-1.5">
                    <StatusBadge status={l.compatibility} />
                  </td>
                  <td className="max-w-[220px] px-2 py-1.5 text-[11px] text-muted">{l.notes}</td>
                  <td className="px-2 py-1.5">
                    {extraId && (
                      <div className="flex gap-1">
                        <label className="flex items-center gap-1 text-[10.5px] text-muted">
                          <input type="checkbox" checked={l.required} onChange={(e) => updateExtra(extraId, { required: e.target.checked })} aria-label={`${l.name} required`} />
                          Req.
                        </label>
                        <button type="button" className="text-faint hover:text-err" onClick={() => removeExtra(extraId)} aria-label={`Remove ${l.name}`}>
                          <Trash2 size={12} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="flex flex-wrap gap-4 border-t border-line bg-panel-2 px-2 py-2 text-[12px]" data-testid="bom-total">
          <span data-testid="bom-required-total" data-total={bom.requiredTotal ?? ''}>
            Required total: {bom.requiredTotal !== null ? <b>{usd(bom.requiredTotal)}</b> : <span className="text-muted">not shown — {bom.unpricedRequired} required line(s) have no verified price</span>}
          </span>
          {bom.lines.some((l) => !l.required) && (
            <span>
              Optional: {bom.optionalTotal !== null ? <b>{usd(bom.optionalTotal)}</b> : <span className="text-muted">not shown — {bom.unpricedOptional} line(s) without a verified price</span>}
            </span>
          )}
          {bom.excludedOrphans > 0 && <span className="text-warn">{bom.excludedOrphans} mapping(s) of removed components are not counted.</span>}
        </div>
      </div>

      <Section title="Add extra hardware (screws, wires, switch, fuse…)" testId="bom-extras">
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            addExtra({ name, quantity: qty, required });
            setName('');
            setQty(1);
          }}
        >
          <label className="flex flex-1 flex-col gap-0.5 text-[11px] text-muted">
            Name
            <input className={inputClass} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="For example: Rocker power switch" data-testid="extra-name" />
          </label>
          <label className="flex flex-col gap-0.5 text-[11px] text-muted">
            Quantity
            <input type="number" min={1} max={10000} className={cn(inputClass, 'w-20')} value={qty} onChange={(e) => setQty(Number(e.target.value))} data-testid="extra-qty" />
          </label>
          <label className="flex items-center gap-1 pb-1.5 text-[11px] text-muted">
            <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} data-testid="extra-required" />
            Required
          </label>
          <Button size="sm" type="submit" icon={<Plus size={12} />} disabled={!name.trim()} data-testid="extra-add">
            Add
          </Button>
        </form>
        <p className="mt-1.5 text-[11px] text-muted">Extra items are not from the catalog, so they have no verified price or specs.</p>
      </Section>
    </div>
  );
}
