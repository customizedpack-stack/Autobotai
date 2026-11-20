import { useMemo, useState } from 'react';
import { Cpu, Plus, Search, Trash2, X } from 'lucide-react';
import { Button } from '../../../components/common/Button';
import { EmptyState } from '../../../components/common/EmptyState';
import { cn } from '../../../utils/cn';
import {
  HARDWARE_ROLES,
  addHardware,
  mapPart,
  removeHardware,
  setMappingQuantity,
  setMappingRequired,
  unmapPart,
  updateSnapshotFromCatalog,
} from '../blueprintActions';
import { missingSpecs, searchParts } from '../catalog/catalog';
import { PART_CATEGORIES, SPEC_LABELS, type CatalogPart, type PartCategory, type PartSpecs } from '../catalog/types';
import { differences, type VirtualComponent } from '../engine/virtualComponents';
import type { HardwareRole } from '../model/types';
import { DocLink, Section, SpecTable, StatusBadge, VerificationBadge } from './shared';
import { formatSpec, inputClass } from './format';
import type { BlueprintView } from './useBlueprintView';

const label = (key: keyof PartSpecs) => SPEC_LABELS.find((s) => s.key === key)?.label ?? key;

function PartPicker({ view, target, onClose }: { view: BlueprintView; target: VirtualComponent; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<PartCategory | 'all'>(target.mapping?.snapshot.category ?? target.suggestedCategories[0] ?? 'all');
  const [compare, setCompare] = useState<string[]>([]);
  const catalog = view.catalog;
  const results = useMemo(() => searchParts(catalog?.parts ?? [], query, category), [catalog, query, category]);
  const compared = compare.map((id) => view.catalog?.byId.get(id)).filter((p): p is CatalogPart => Boolean(p));
  const toggleCompare = (id: string) => setCompare((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id].slice(-3)));

  return (
    <div className="mt-2 rounded-md border border-accent/40 bg-app p-2" data-testid="part-picker">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-semibold">Choose a real part for {target.name}</span>
        <button type="button" className="ml-auto text-faint hover:text-ink" aria-label="Close part picker" onClick={onClose}>
          <X size={14} />
        </button>
      </div>
      <div className="mb-2 flex flex-wrap gap-1.5">
        <label className="relative flex-1">
          <Search size={12} className="absolute top-2 left-2 text-faint" />
          <input className={cn(inputClass, 'w-full pl-6')} placeholder="Search name, maker, part number…" value={query} onChange={(e) => setQuery(e.target.value)} data-testid="part-search" aria-label="Search parts" />
        </label>
        <select className={inputClass} value={category} onChange={(e) => setCategory(e.target.value as PartCategory | 'all')} data-testid="part-category" aria-label="Category">
          <option value="all">All categories</option>
          {PART_CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
      {!view.catalog ? (
        <p className="text-[11px] text-muted">{view.catalogError ? `The parts catalog could not be loaded: ${view.catalogError}` : 'Loading the parts catalog…'}</p>
      ) : results.length === 0 ? (
        <p className="text-[11px] text-muted" data-testid="part-results-empty">
          No verified part matches. {category !== 'all' && `Covered by this category: ${PART_CATEGORIES.find((c) => c.id === category)?.covers}. Parts without verified manufacturer data are not listed.`}
        </p>
      ) : (
        <ul className="max-h-72 space-y-1 overflow-auto" data-testid="part-results">
          {results.map((p) => (
            <li key={p.id} className="rounded border border-line-soft bg-panel px-2 py-1.5" data-testid={`part-${p.id}`}>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[12px] font-medium">{p.name}</span>
                <VerificationBadge part={p} />
                <span className="text-[11px] text-muted">
                  {p.manufacturer} · {p.mpn ?? 'part number unknown'}
                </span>
                <div className="ml-auto flex gap-1">
                  <label className="flex items-center gap-1 text-[11px] text-muted">
                    <input type="checkbox" checked={compare.includes(p.id)} onChange={() => toggleCompare(p.id)} data-testid={`compare-${p.id}`} />
                    Compare
                  </label>
                  <Button size="sm" variant={target.mapping?.partId === p.id ? 'secondary' : 'primary'} disabled={target.mapping?.partId === p.id} onClick={() => mapPart(target.kind, target.id, p) && onClose()} data-testid={`pick-${p.id}`}>
                    {target.mapping?.partId === p.id ? 'Selected' : target.mapping ? 'Replace' : 'Select'}
                  </Button>
                </div>
              </div>
              <p className="mt-0.5 text-[11px] text-muted">{p.description}</p>
              <div className="mt-0.5 flex flex-wrap gap-3 text-[11px]">
                <DocLink href={p.officialUrl}>Product page</DocLink>
                <DocLink href={p.datasheetUrl}>Datasheet</DocLink>
                <DocLink href={p.source.url}>Source</DocLink>
                <span className="text-faint">{p.price ? `US$${p.price.amount.toFixed(2)} (list price, ${p.price.checkedAt})` : 'No verified price'}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
      {compared.length >= 2 && <CompareTable parts={compared} />}
    </div>
  );
}

function CompareTable({ parts }: { parts: CatalogPart[] }) {
  const keys = SPEC_LABELS.filter((r) => parts.some((p) => p.specs[r.key] !== undefined));
  return (
    <div className="mt-2 overflow-auto" data-testid="compare-table">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-left text-muted">
            <th className="py-1 pr-2 font-medium">Spec</th>
            {parts.map((p) => (
              <th key={p.id} className="py-1 pr-2 font-medium text-ink">
                {p.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {keys.map((r) => (
            <tr key={r.key} className="border-t border-line-soft">
              <td className="py-0.5 pr-2 text-muted">{r.label}</td>
              {parts.map((p) => (
                <td key={p.id} className={cn('py-0.5 pr-2 font-mono', p.specs[r.key] === undefined && 'text-faint')}>
                  {formatSpec(p.specs[r.key], r.unit)}
                </td>
              ))}
            </tr>
          ))}
          <tr className="border-t border-line-soft">
            <td className="py-0.5 pr-2 text-muted">List price</td>
            {parts.map((p) => (
              <td key={p.id} className="py-0.5 pr-2 font-mono">
                {p.price ? `US$${p.price.amount.toFixed(2)}` : 'Unknown'}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function ComponentRow({ view, vc, picking, onPick }: { view: BlueprintView; vc: VirtualComponent; picking: boolean; onPick: (open: boolean) => void }) {
  const m = vc.mapping;
  const part = m?.snapshot;
  const status = m ? view.byMapping.get(m.id) ?? 'unknown' : null;
  const diffs = part ? differences(vc, part) : [];
  const missing = part ? missingSpecs(part) : [];
  const current = m && view.catalog?.byId.get(m.partId);
  const stale = Boolean(m && current && JSON.stringify(current) !== JSON.stringify(m.snapshot));
  return (
    <li className="rounded-md border border-line bg-panel px-2.5 py-2" data-testid={`vc-${vc.id}`} data-name={vc.name} data-mapped={Boolean(m)}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[12px] font-semibold">{vc.name}</span>
        <span className="rounded bg-raised px-1 text-[10px] text-muted">{vc.kind === 'hardware' ? `Blueprint-only · ${vc.category}` : vc.category}</span>
        {status && <StatusBadge status={status} testId={`vc-status-${vc.id}`} />}
        <div className="ml-auto flex gap-1">
          <Button size="sm" variant={m ? 'secondary' : 'primary'} onClick={() => onPick(!picking)} data-testid={`map-${vc.id}`}>
            {m ? 'Change part' : 'Map real part'}
          </Button>
          {m && (
            <Button size="sm" variant="ghost" onClick={() => unmapPart(m.id)} data-testid={`unmap-${vc.id}`} aria-label={`Remove part from ${vc.name}`}>
              <Trash2 size={12} />
            </Button>
          )}
          {vc.kind === 'hardware' && (
            <Button size="sm" variant="danger" onClick={() => removeHardware(vc.id)} data-testid={`remove-hw-${vc.id}`}>
              Remove item
            </Button>
          )}
        </div>
      </div>
      {part && m ? (
        <div className="mt-1.5 grid gap-2 lg:grid-cols-2">
          <div>
            <p className="text-[12px]">
              <span className="font-medium" data-testid={`vc-part-${vc.id}`}>
                {part.name}
              </span>{' '}
              <span className="text-muted">
                — {part.manufacturer}, {part.mpn ?? 'part number unknown'}
              </span>{' '}
              <VerificationBadge part={part} />
            </p>
            <div className="mt-1 flex flex-wrap gap-3 text-[11px]">
              <DocLink href={part.officialUrl} testId={`doc-${vc.id}`}>
                Product page
              </DocLink>
              <DocLink href={part.datasheetUrl}>Datasheet</DocLink>
              <DocLink href={part.source.url}>Source ({part.source.verifiedAt})</DocLink>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px]">
              <label className="flex items-center gap-1 text-muted">
                Quantity
                <input type="number" min={1} max={10000} className={cn(inputClass, 'w-16')} defaultValue={m.quantity} key={m.quantity} onBlur={(e) => setMappingQuantity(m.id, Number(e.target.value))} data-testid={`qty-${vc.id}`} />
              </label>
              <label className="flex items-center gap-1 text-muted">
                <input type="checkbox" checked={m.required} onChange={(e) => setMappingRequired(m.id, e.target.checked)} />
                Required
              </label>
            </div>
            {stale && (
              <p className="mt-1 text-[11px] text-warn">
                The catalog has different data for this part. Your robot still uses the saved snapshot.{' '}
                <button type="button" className="underline" onClick={() => updateSnapshotFromCatalog(m.id)}>
                  Update to catalog data
                </button>
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <SpecTable part={part} compact />
            {diffs.length > 0 && (
              <div className="rounded border border-warn/30 bg-warn/5 p-1.5 text-[11px]" data-testid={`diffs-${vc.id}`}>
                <p className="font-medium text-warn">Virtual vs physical</p>
                {diffs.map((d) => (
                  <p key={d.label}>
                    {d.label}: 3D model {d.virtual}, real part {d.physical}
                  </p>
                ))}
              </div>
            )}
            {missing.length > 0 && (
              <p className="text-[11px] text-muted" data-testid={`missing-${vc.id}`}>
                Missing information: {missing.map(label).join(', ')}.
              </p>
            )}
          </div>
        </div>
      ) : (
        <p className="mt-1 text-[11px] text-muted">
          Not mapped.{vc.virtualSizeMm && ` 3D size ${vc.virtualSizeMm.join(' × ')} mm.`}
          {vc.sensorNames.length > 0 && ` Simulated sensors: ${vc.sensorNames.join(', ')}.`}
        </p>
      )}
      {picking && <PartPicker view={view} target={vc} onClose={() => onPick(false)} />}
    </li>
  );
}

export function PartsTab({ view }: { view: BlueprintView }) {
  const [picking, setPicking] = useState<string | null>(null);
  const [role, setRole] = useState<HardwareRole>('driver');
  const components = view.vcs.filter((v) => v.kind === 'component');
  const hardware = view.vcs.filter((v) => v.kind === 'hardware');
  return (
    <div className="space-y-3">
      <p className="text-[11px] text-muted">
        Map each 3D component to a real part. Nothing is mapped automatically. A mapping stores the part number and a snapshot of its verified data, so a catalog update never changes your robot. Mapping a part does not change the 3D model.
      </p>
      {view.orphans.length > 0 && (
        <Section title="Mappings of removed components" testId="orphans">
          <ul className="space-y-1 text-[12px]">
            {view.orphans.map((m) => (
              <li key={m.id} className="flex items-center gap-2">
                <span>{m.snapshot.name}</span>
                <span className="text-[11px] text-muted">The component was removed from the 3D model.</span>
                <Button size="sm" variant="ghost" className="ml-auto" onClick={() => unmapPart(m.id)} data-testid={`orphan-remove-${m.id}`}>
                  Remove mapping
                </Button>
              </li>
            ))}
          </ul>
        </Section>
      )}
      <Section title={`3D model components (${components.length})`} testId="parts-components">
        {components.length === 0 ? (
          <EmptyState icon={<Cpu size={18} />} title="No components yet" description="Add components in Build Mode, then map them to real parts here." />
        ) : (
          <ul className="space-y-1.5">
            {components.map((vc) => (
              <ComponentRow key={vc.ref} view={view} vc={vc} picking={picking === vc.ref} onPick={(open) => setPicking(open ? vc.ref : null)} />
            ))}
          </ul>
        )}
      </Section>
      <Section
        title={`Blueprint-only hardware (${hardware.length})`}
        testId="parts-hardware"
        actions={
          <>
            <select className={inputClass} value={role} onChange={(e) => setRole(e.target.value as HardwareRole)} data-testid="hardware-role" aria-label="Hardware type">
              {HARDWARE_ROLES.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
            <Button size="sm" icon={<Plus size={12} />} onClick={() => setPicking(`hardware:${addHardware(role)}`)} data-testid="add-hardware">
              Add hardware item
            </Button>
          </>
        }
      >
        {hardware.length === 0 ? (
          <p className="text-[11px] text-muted" data-testid="hardware-empty">
            Electronics that the 3D model does not show (motor driver, battery, regulator) are added here. They appear in the BOM, wiring and guide, but are not added to the 3D model.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {hardware.map((vc) => (
              <ComponentRow key={vc.ref} view={view} vc={vc} picking={picking === vc.ref} onPick={(open) => setPicking(open ? vc.ref : null)} />
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
