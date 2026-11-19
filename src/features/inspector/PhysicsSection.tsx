import { useMemo, type ReactNode } from 'react';
import { RotateCcw } from 'lucide-react';
import { checkPhysicsValue, resolvePartPhysics } from '../physics/bodies/materials';
import { shapeFor, shapeVolume } from '../physics/bodies/shapes';
import { PHYSICS_LIMITS } from '../physics/physicsConfig';
import { indexObjects, worldTransform } from '../robot-model/transforms';
import { useSceneStore } from '../../stores/sceneStore';
import type { PartPhysics, SceneObject } from '../../types/scene';
import { log } from '../../utils/logger';
import { cn } from '../../utils/cn';
import { NumberField } from './NumberField';

function Line({ label, hint, children }: { label: string; hint: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[1fr_96px] items-center gap-2 py-0.5 text-xs">
      <span className="text-faint">
        {label} <span className="text-[10px] text-faint/70">{hint}</span>
      </span>
      {children}
    </div>
  );
}

type NumericKey = 'mass' | 'friction' | 'restitution';

/**
 * Physics properties of a part (Phase 5). Values are optional overrides stored on
 * the part; anything not set uses defaults from the part's category, so legacy
 * projects behave the same as before. Every edit is one undoable step.
 */
export function PhysicsSection({ object }: { object: SceneObject }) {
  const objects = useSceneStore((s) => s.objects);
  const setPartPhysics = useSceneStore((s) => s.setPartPhysics);
  const resolved = resolvePartPhysics(object);
  const marker = object.category === 'joint';

  const autoMass = useMemo(() => {
    const t = worldTransform(object.id, indexObjects(objects));
    return resolved.density * shapeVolume(shapeFor(object.geometry, t.scale));
  }, [object.id, object.geometry, objects, resolved.density]);

  const update = (patch: Partial<PartPhysics>) => {
    const next: PartPhysics = { ...object.physics, ...patch };
    for (const k of Object.keys(next) as (keyof PartPhysics)[]) if (next[k] === undefined) delete next[k];
    setPartPhysics(object.id, next);
  };

  const commitNumber = (key: NumericKey) => (value: number) => {
    const problem = checkPhysicsValue(key, value);
    if (problem) {
      log.warning('inspector', `${object.name}: ${problem}`);
      return;
    }
    update({ [key]: value });
  };

  if (marker) {
    return <p className="text-[11px] text-muted">Joint markers are visual helpers. They have no mass or collision shape in the physics simulation.</p>;
  }

  return (
    <div data-testid="physics-section">
      <Line label="Mass" hint={resolved.source.mass === 'set' ? 'kg · set' : 'kg · auto'}>
        <NumberField label="kg" value={resolved.mass ?? autoMass} step={0.05} decimals={3} min={PHYSICS_LIMITS.mass.min} onCommit={commitNumber('mass')} testId="phys-mass" />
      </Line>
      <Line label="Friction" hint={resolved.source.friction === 'set' ? 'set' : 'auto'}>
        <NumberField label="μ" value={resolved.friction} step={0.05} decimals={2} min={0} onCommit={commitNumber('friction')} testId="phys-friction" />
      </Line>
      <Line label="Bounciness" hint={resolved.source.restitution === 'set' ? 'set' : 'auto'}>
        <NumberField label="e" value={resolved.restitution} step={0.05} decimals={2} min={0} onCommit={commitNumber('restitution')} testId="phys-restitution" />
      </Line>
      <div className="mt-1 flex items-center justify-between text-xs">
        <span className="text-faint">Collision</span>
        <button
          type="button"
          role="switch"
          aria-checked={resolved.collision}
          aria-label="Collision"
          data-testid="phys-collision"
          onClick={() => update({ collision: resolved.collision ? false : undefined })}
          className={cn('relative h-4 w-7 shrink-0 rounded-full transition-colors', resolved.collision ? 'bg-accent' : 'bg-line')}
        >
          <span className={cn('absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all', resolved.collision ? 'left-3.5' : 'left-0.5')} />
        </button>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <p className="text-[10.5px] text-faint">Auto mass = density {resolved.density} kg/m³ × volume.</p>
        {object.physics && (
          <button type="button" className="inline-flex items-center gap-1 text-[11px] text-muted hover:text-ink" onClick={() => setPartPhysics(object.id, undefined)} data-testid="phys-reset">
            <RotateCcw size={11} /> Defaults
          </button>
        )}
      </div>
    </div>
  );
}
