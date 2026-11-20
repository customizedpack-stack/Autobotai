import type { CatalogPart } from '../catalog/types';
import type { BlueprintData } from '../model/types';
import { worst, type CompatCheck, type CompatStatus } from './compatibility';
import { orphanMappings, refOf, virtualComponents, type ModelView } from './virtualComponents';

/**
 * Bill of materials. Built live from the mappings and the extra hardware, so
 * it updates when a mapping changes. Prices come only from the saved part
 * snapshots (verified manufacturer prices with a date); nothing is estimated.
 */

export interface BomLine {
  key: string;
  name: string;
  manufacturer: string;
  model: string;
  /** Units needed (sum of mapping quantities). */
  units: number;
  /** Purchasable items (packs) to buy: ceil(units / pack size). */
  quantity: number;
  packQuantity: number;
  unitPrice: number | null;
  currency: 'USD' | null;
  priceCheckedAt: string | null;
  total: number | null;
  productUrl: string | null;
  datasheetUrl: string | null;
  compatibility: CompatStatus | 'not-checked';
  required: boolean;
  usedFor: string[];
  notes: string;
  source: 'mapping' | 'extra';
}

export interface Bom {
  lines: BomLine[];
  /** Total of required lines, only when every required line has a verified price. */
  requiredTotal: number | null;
  /** Total of optional lines, only when every optional line has a verified price. */
  optionalTotal: number | null;
  unpricedRequired: number;
  unpricedOptional: number;
  /** Mappings left out because their component no longer exists. */
  excludedOrphans: number;
  currency: 'USD';
}

export const PRICE_NOTICE =
  'Prices are the manufacturer’s single-item list prices on the date shown and are not live. Prices and availability change; check the seller before buying. Taxes and shipping are not included.';

const money = (n: number) => Math.round(n * 100) / 100;

function line(part: CatalogPart, units: number, required: boolean, usedFor: string[], notes: string, compatibility: BomLine['compatibility'], source: BomLine['source']): BomLine {
  const quantity = Math.ceil(units / part.packQuantity);
  const unitPrice = part.price && part.price.forQuantity === 1 ? part.price.amount : null;
  return {
    key: `${source}:${part.id}:${required ? 'r' : 'o'}`,
    name: part.name,
    manufacturer: part.manufacturer,
    model: part.mpn ?? 'Unknown',
    units,
    quantity,
    packQuantity: part.packQuantity,
    unitPrice,
    currency: unitPrice !== null ? 'USD' : null,
    priceCheckedAt: unitPrice !== null ? part.price!.checkedAt : null,
    total: unitPrice !== null ? money(unitPrice * quantity) : null,
    productUrl: part.officialUrl,
    datasheetUrl: part.datasheetUrl,
    compatibility,
    required,
    usedFor,
    notes: [part.packQuantity > 1 ? `Sold in packs of ${part.packQuantity}; ${units} needed.` : '', part.verification === 'unverified' ? 'Generic part: specs unverified.' : '', unitPrice === null ? part.priceNote ?? 'No verified price.' : '', notes]
      .filter(Boolean)
      .join(' '),
    source,
  };
}

export function buildBom(model: ModelView, data: BlueprintData, checks: readonly CompatCheck[]): Bom {
  const orphans = new Set(orphanMappings(model, data).map((m) => m.id));
  const names = new Map(virtualComponents(model, data).map((v) => [v.ref, v.name]));
  const statusFor = (ids: string[]): CompatStatus => {
    const statuses = checks.filter((c) => c.mappingIds.some((id) => ids.includes(id))).map((c) => c.status);
    return worst(statuses);
  };
  const groups = new Map<string, { part: CatalogPart; units: number; required: boolean; usedFor: string[]; ids: string[]; notes: string[] }>();
  for (const m of data.mappings) {
    if (orphans.has(m.id)) continue;
    const key = `${m.partId}|${m.required}`;
    const g = groups.get(key) ?? { part: m.snapshot, units: 0, required: m.required, usedFor: [], ids: [], notes: [] };
    g.units += m.quantity;
    g.usedFor.push(names.get(refOf(m.targetKind, m.targetId)) ?? m.targetId);
    g.ids.push(m.id);
    if (m.note) g.notes.push(m.note);
    groups.set(key, g);
  }
  const lines: BomLine[] = [...groups.values()].map((g) => line(g.part, g.units, g.required, g.usedFor, g.notes.join(' '), statusFor(g.ids), 'mapping'));
  for (const e of data.bomExtras) {
    if (e.snapshot) lines.push({ ...line(e.snapshot, e.quantity, e.required, ['Extra hardware'], e.note, 'not-checked', 'extra'), key: `extra:${e.id}` });
    else
      lines.push({
        key: `extra:${e.id}`,
        name: e.name,
        manufacturer: 'Unknown',
        model: 'Unknown',
        units: e.quantity,
        quantity: e.quantity,
        packQuantity: 1,
        unitPrice: null,
        currency: null,
        priceCheckedAt: null,
        total: null,
        productUrl: null,
        datasheetUrl: null,
        compatibility: 'not-checked',
        required: e.required,
        usedFor: ['Extra hardware'],
        notes: [e.note, 'Not from the catalog: no verified specs or price.'].filter(Boolean).join(' '),
        source: 'extra',
      });
  }
  const required = lines.filter((l) => l.required);
  const optional = lines.filter((l) => !l.required);
  const sum = (ls: BomLine[]) => (ls.length > 0 && ls.every((l) => l.total !== null) ? money(ls.reduce((n, l) => n + l.total!, 0)) : null);
  return {
    lines,
    requiredTotal: sum(required),
    optionalTotal: sum(optional),
    unpricedRequired: required.filter((l) => l.total === null).length,
    unpricedOptional: optional.filter((l) => l.total === null).length,
    excludedOrphans: orphans.size,
    currency: 'USD',
  };
}

/** CSV cell: quoted, with formula injection guarded (cells starting with = + - @ get a leading apostrophe). */
export function csvCell(value: string | number | null): string {
  if (value === null) return '';
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text) && typeof value === 'string') text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function bomToCsv(bom: Bom, projectName: string, generatedAt: string): string {
  const header = ['Name', 'Manufacturer', 'Model', 'Quantity', 'Units needed', 'Unit price (USD)', 'Total (USD)', 'Price checked', 'Product link', 'Datasheet link', 'Compatibility', 'Required', 'Used for', 'Notes'];
  const rows = bom.lines.map((l) => [l.name, l.manufacturer, l.model, l.quantity, l.units, l.unitPrice, l.total, l.priceCheckedAt, l.productUrl, l.datasheetUrl, l.compatibility, l.required ? 'Required' : 'Optional', l.usedFor.join('; '), l.notes]);
  const meta = [
    [`Bill of materials: ${projectName}`],
    [`Generated ${generatedAt}`],
    [PRICE_NOTICE],
    [bom.requiredTotal !== null ? `Required total (USD): ${bom.requiredTotal.toFixed(2)}` : `Required total not shown: ${bom.unpricedRequired} required line(s) have no verified price.`],
    [],
  ];
  return [...meta, header, ...rows].map((r) => r.map((c) => csvCell(c as string | number | null)).join(',')).join('\r\n') + '\r\n';
}
