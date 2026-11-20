import { PARTS } from '../../blueprint/catalog/parts';
import type { ProjectDefinition } from '../model/types';

/** Verified list prices only (Phase 9 catalog). Parts without a verified price are counted, never estimated. */
export function verifiedBudget(def: ProjectDefinition): { total: number; priced: number; unpriced: string[]; checkedAt: string | null } | null {
  if (def.parts.length === 0) return null;
  let total = 0;
  let priced = 0;
  let checkedAt: string | null = null;
  const unpriced: string[] = [];
  for (const p of def.parts) {
    const part = PARTS.find((x) => x.id === p.partId);
    if (part?.price) {
      total += part.price.amount * (p.quantity / part.price.forQuantity);
      priced += 1;
      checkedAt = part.price.checkedAt;
    } else unpriced.push(part?.name ?? p.partId);
  }
  return priced > 0 ? { total: Math.round(total * 100) / 100, priced, unpriced, checkedAt } : null;
}

export function partName(partId: string): { name: string; url: string | null; verification: string } {
  const part = PARTS.find((p) => p.id === partId);
  return part ? { name: `${part.manufacturer} ${part.mpn} — ${part.name}`, url: part.officialUrl, verification: part.verification } : { name: partId, url: null, verification: 'unknown' };
}

