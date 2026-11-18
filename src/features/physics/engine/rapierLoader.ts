/**
 * Lazy Rapier loader. The engine (WebAssembly, ~2 MB) is downloaded only when a
 * physics simulation starts, so the dashboard and kinematic mode stay small.
 */
export type Rapier = typeof import('@dimforge/rapier3d-compat');

let pending: Promise<Rapier> | null = null;

export function loadRapier(): Promise<Rapier> {
  pending ??= import('@dimforge/rapier3d-compat').then(async (module) => {
    const rapier = ((module as unknown as { default?: Rapier }).default ?? module) as Rapier;
    await rapier.init();
    return rapier;
  });
  return pending;
}
