import type { CatalogPart, PartCategory, PartSpecs } from './types';
import { IMPORTANT_SPECS, PART_CATEGORIES } from './types';

/**
 * Catalog access. The part data is loaded lazily the first time the Blueprint
 * workspace needs it, validated once, and kept in memory. The catalog is
 * independent of projects: projects store a part id plus a snapshot.
 */

export interface LoadedCatalog {
  version: string;
  parts: CatalogPart[];
  byId: Map<string, CatalogPart>;
  /** Entries rejected by validation, with reasons (should be empty for the bundled data). */
  rejected: { id: string; errors: string[] }[];
}

let loading: Promise<LoadedCatalog> | null = null;
let loaded: LoadedCatalog | null = null;

export function loadCatalog(): Promise<LoadedCatalog> {
  if (loaded) return Promise.resolve(loaded);
  loading ??= import('./parts').then((mod) => {
    loaded = buildCatalog(mod.PARTS, mod.CATALOG_VERSION);
    return loaded;
  });
  return loading;
}

/** The catalog if it is already loaded (synchronous callers such as the engines in the UI). */
export function catalogIfLoaded(): LoadedCatalog | null {
  return loaded;
}

/** Validate and index parts. Invalid or duplicate entries are rejected, never repaired silently. */
export function buildCatalog(input: unknown[], version: string): LoadedCatalog {
  const parts: CatalogPart[] = [];
  const byId = new Map<string, CatalogPart>();
  const keys = new Set<string>();
  const rejected: LoadedCatalog['rejected'] = [];
  for (const raw of input) {
    const errors = validatePart(raw);
    const id = typeof (raw as { id?: unknown })?.id === 'string' ? (raw as { id: string }).id : '(no id)';
    if (errors.length === 0) {
      const part = raw as CatalogPart;
      const key = `${part.manufacturer.toLowerCase()}|${(part.mpn ?? part.name).toLowerCase()}`;
      if (byId.has(part.id)) errors.push('Duplicate id.');
      else if (keys.has(key)) errors.push('Duplicate manufacturer and part number.');
      if (errors.length === 0) {
        const clean = sanitizePart(part);
        parts.push(clean);
        byId.set(clean.id, clean);
        keys.add(key);
        continue;
      }
    }
    rejected.push({ id, errors });
  }
  return { version, parts, byId, rejected };
}

const CATEGORY_IDS = new Set(PART_CATEGORIES.map((c) => c.id));
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Structural validation of one catalog entry (also used for imported data and saved snapshots). */
export function validatePart(raw: unknown): string[] {
  const errors: string[] = [];
  if (!raw || typeof raw !== 'object') return ['Not an object.'];
  const p = raw as Partial<CatalogPart>;
  if (typeof p.id !== 'string' || !/^[a-z0-9][a-z0-9-]{1,60}$/.test(p.id)) errors.push('Invalid id.');
  if (typeof p.manufacturer !== 'string' || !p.manufacturer.trim()) errors.push('Missing manufacturer.');
  if (p.mpn !== null && typeof p.mpn !== 'string') errors.push('Invalid part number.');
  if (typeof p.name !== 'string' || !p.name.trim()) errors.push('Missing name.');
  if (!p.category || !CATEGORY_IDS.has(p.category)) errors.push('Invalid category.');
  if (typeof p.role !== 'string' || !(p.role in IMPORTANT_SPECS)) errors.push('Invalid role.');
  if (!p.specs || typeof p.specs !== 'object') errors.push('Missing specs.');
  else {
    for (const [key, value] of Object.entries(p.specs)) {
      if (value === undefined) continue;
      const ok = typeof value === 'number' ? Number.isFinite(value) && value >= 0 : typeof value === 'string' || (Array.isArray(value) && value.every((v) => typeof v === 'string'));
      if (!ok) errors.push(`Invalid spec "${key}".`);
    }
  }
  if (typeof p.packQuantity !== 'number' || !Number.isInteger(p.packQuantity) || p.packQuantity < 1) errors.push('Invalid pack quantity.');
  if (!p.source || typeof p.source.url !== 'string' || !sanitizeUrl(p.source.url)) errors.push('Missing or unsafe source URL.');
  if (!p.source || typeof p.source.verifiedAt !== 'string' || !ISO_DATE.test(p.source.verifiedAt)) errors.push('Missing verification date.');
  if (p.price !== null && p.price !== undefined) {
    if (typeof p.price.amount !== 'number' || !(p.price.amount > 0) || p.price.currency !== 'USD' || !sanitizeUrl(p.price.url) || !ISO_DATE.test(p.price.checkedAt ?? ''))
      errors.push('Price without a valid amount, currency, source page or date.');
  }
  if (p.verification !== 'verified' && p.verification !== 'partial' && p.verification !== 'unverified') errors.push('Invalid verification level.');
  return errors;
}

/** Only https links to a real host are allowed; anything else becomes null. */
export function sanitizeUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 500) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !url.hostname.includes('.') || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function sanitizePart(part: CatalogPart): CatalogPart {
  return {
    ...part,
    datasheetUrl: sanitizeUrl(part.datasheetUrl),
    officialUrl: sanitizeUrl(part.officialUrl),
    imageUrl: null,
    source: { ...part.source, url: sanitizeUrl(part.source.url) ?? '' },
    price: part.price ? { ...part.price, url: sanitizeUrl(part.price.url) ?? '' } : null,
  };
}

/** Search by words in name, manufacturer, part number, description or category; optional category filter. */
export function searchParts(parts: readonly CatalogPart[], query: string, category: PartCategory | 'all' = 'all'): CatalogPart[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return parts.filter((p) => {
    if (category !== 'all' && p.category !== category) return false;
    if (words.length === 0) return true;
    const text = `${p.name} ${p.manufacturer} ${p.mpn ?? ''} ${p.description} ${p.category} ${p.role}`.toLowerCase();
    return words.every((w) => text.includes(w));
  });
}

/** Spec keys the engines need for this part that the source did not state. */
export function missingSpecs(part: CatalogPart): (keyof PartSpecs)[] {
  return IMPORTANT_SPECS[part.role].filter((key) => part.specs[key] === undefined);
}

/** Reset for tests. */
export function resetCatalogForTests(): void {
  loading = null;
  loaded = null;
}
