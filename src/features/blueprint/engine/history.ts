import type { BlueprintData } from '../model/types';

/** Differences between two blueprint versions (used by "Compare" in Build History). */
export interface BlueprintDiff {
  mappings: { target: string; before: string | null; after: string | null }[];
  hardware: { name: string; change: 'added' | 'removed' }[];
  extras: { name: string; change: 'added' | 'removed' | 'changed' }[];
  wiring: { added: number; removed: number; changed: number };
  steps: { id: string; before: string; after: string }[];
}

export function compareData(a: BlueprintData, b: BlueprintData, nameOf: (ref: string) => string = (r) => r): BlueprintDiff {
  const aMap = new Map(a.mappings.map((m) => [`${m.targetKind}:${m.targetId}`, m]));
  const bMap = new Map(b.mappings.map((m) => [`${m.targetKind}:${m.targetId}`, m]));
  const mappings: BlueprintDiff['mappings'] = [];
  for (const key of new Set([...aMap.keys(), ...bMap.keys()])) {
    const x = aMap.get(key);
    const y = bMap.get(key);
    if (x?.partId === y?.partId && x?.quantity === y?.quantity) continue;
    mappings.push({ target: nameOf(key), before: x ? `${x.snapshot.name} × ${x.quantity}` : null, after: y ? `${y.snapshot.name} × ${y.quantity}` : null });
  }
  const aHw = new Map(a.hardware.map((h) => [h.id, h]));
  const bHw = new Map(b.hardware.map((h) => [h.id, h]));
  const hardware: BlueprintDiff['hardware'] = [
    ...b.hardware.filter((h) => !aHw.has(h.id)).map((h) => ({ name: h.name, change: 'added' as const })),
    ...a.hardware.filter((h) => !bHw.has(h.id)).map((h) => ({ name: h.name, change: 'removed' as const })),
  ];
  const aEx = new Map(a.bomExtras.map((e) => [e.id, e]));
  const bEx = new Map(b.bomExtras.map((e) => [e.id, e]));
  const extras: BlueprintDiff['extras'] = [
    ...b.bomExtras.filter((e) => !aEx.has(e.id)).map((e) => ({ name: e.name, change: 'added' as const })),
    ...a.bomExtras.filter((e) => !bEx.has(e.id)).map((e) => ({ name: e.name, change: 'removed' as const })),
    ...b.bomExtras.filter((e) => aEx.has(e.id) && JSON.stringify(aEx.get(e.id)) !== JSON.stringify(e)).map((e) => ({ name: e.name, change: 'changed' as const })),
  ];
  const aW = new Map(a.wiring.map((w) => [w.id, JSON.stringify(w)]));
  const bW = new Map(b.wiring.map((w) => [w.id, JSON.stringify(w)]));
  const wiring = {
    added: [...bW.keys()].filter((k) => !aW.has(k)).length,
    removed: [...aW.keys()].filter((k) => !bW.has(k)).length,
    changed: [...bW.keys()].filter((k) => aW.has(k) && aW.get(k) !== bW.get(k)).length,
  };
  const steps: BlueprintDiff['steps'] = [];
  for (const id of new Set([...Object.keys(a.guide.steps), ...Object.keys(b.guide.steps)])) {
    const before = a.guide.steps[id]?.status ?? 'not-started';
    const after = b.guide.steps[id]?.status ?? 'not-started';
    if (before !== after) steps.push({ id, before, after });
  }
  return { mappings, hardware, extras, wiring, steps };
}

export function isEmptyDiff(d: BlueprintDiff): boolean {
  return d.mappings.length + d.hardware.length + d.extras.length + d.wiring.added + d.wiring.removed + d.wiring.changed + d.steps.length === 0;
}
