import type { SceneObject } from '../../types/scene';

/** Parent id → ordered child ids. Roots are listed under the key `null`. */
export function childrenMap(objects: readonly SceneObject[]): Map<string | null, string[]> {
  const ids = new Set(objects.map((o) => o.id));
  const map = new Map<string | null, string[]>();
  for (const object of objects) {
    // A missing parent is treated as a root so no component is ever hidden.
    const key = object.parentId && ids.has(object.parentId) ? object.parentId : null;
    const list = map.get(key) ?? [];
    list.push(object.id);
    map.set(key, list);
  }
  return map;
}

export function childIds(objects: readonly SceneObject[], id: string): string[] {
  return objects.filter((o) => o.parentId === id).map((o) => o.id);
}

/** All descendants of `id` (children, grandchildren, ...). */
export function descendantIds(objects: readonly SceneObject[], id: string): Set<string> {
  const map = childrenMap(objects);
  const result = new Set<string>();
  const stack = [...(map.get(id) ?? [])];
  while (stack.length) {
    const next = stack.pop()!;
    if (result.has(next)) continue;
    result.add(next);
    stack.push(...(map.get(next) ?? []));
  }
  return result;
}

/** Ancestors from the direct parent up to the root. */
export function ancestorIds(objects: readonly SceneObject[], id: string): string[] {
  const byId = new Map(objects.map((o) => [o.id, o]));
  const result: string[] = [];
  let current = byId.get(id)?.parentId ?? null;
  while (current && !result.includes(current)) {
    result.push(current);
    current = byId.get(current)?.parentId ?? null;
  }
  return result;
}

/** Why `childId` cannot be placed under `parentId`, or null when it can. */
export function reparentError(objects: readonly SceneObject[], childId: string, parentId: string | null): string | null {
  const child = objects.find((o) => o.id === childId);
  if (!child) return 'Component not found.';
  if (parentId === null) return null;
  if (parentId === childId) return 'A component cannot be its own parent.';
  if (!objects.some((o) => o.id === parentId)) return 'Parent component not found.';
  if (descendantIds(objects, childId).has(parentId)) {
    return 'That would create a loop: the new parent is attached to this component.';
  }
  return null;
}

/** Components that can become the parent of `id` (excludes itself and its descendants). */
export function validParentIds(objects: readonly SceneObject[], id: string): string[] {
  const blocked = descendantIds(objects, id);
  blocked.add(id);
  return objects.filter((o) => !blocked.has(o.id)).map((o) => o.id);
}

/** Depth-first order (parents before children) with depth, for trees and selects. */
export function flattenTree(objects: readonly SceneObject[]): { id: string; depth: number }[] {
  const map = childrenMap(objects);
  const out: { id: string; depth: number }[] = [];
  const visit = (id: string, depth: number, seen: Set<string>) => {
    if (seen.has(id)) return;
    seen.add(id);
    out.push({ id, depth });
    for (const child of map.get(id) ?? []) visit(child, depth + 1, seen);
  };
  const seen = new Set<string>();
  for (const root of map.get(null) ?? []) visit(root, 0, seen);
  // Components caught in a corrupt loop are still listed, as roots.
  for (const object of objects) if (!seen.has(object.id)) visit(object.id, 0, seen);
  return out;
}
