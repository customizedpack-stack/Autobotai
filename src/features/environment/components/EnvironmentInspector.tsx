import { useState, type ReactNode } from 'react';
import { Copy, Lock, RotateCcw, Trash2, Unlock } from 'lucide-react';
import { Badge } from '../../../components/common/Badge';
import { Button } from '../../../components/common/Button';
import type { EnvironmentObject } from '../../../types/environment';
import type { Vec3 } from '../../../types/scene';
import { cn } from '../../../utils/cn';
import { DEG_TO_RAD, RAD_TO_DEG } from '../../../utils/math';
import { NumberField } from '../../inspector/NumberField';
import { VectorRow } from '../../inspector/VectorRow';
import { ENV_LIMITS, KIND_LABEL, normalizeSize, rampHeightFor, rampInclination, validateEnvironment } from '../config/environmentConfig';
import { findTemplate } from '../config/templates';
import { duplicateObject, removeObject, renameEnvironment, resetToTemplate, updateObject, useEnvironmentStore, type EnvResult } from '../store/environmentStore';

function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="border-b border-line-soft px-3 py-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[10.5px] font-semibold tracking-wider text-muted uppercase">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function Line({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[1fr_110px] items-center gap-2 py-0.5 text-xs">
      <span className="text-faint">
        {label} {hint && <span className="text-[10px] text-faint/70">{hint}</span>}
      </span>
      {children}
    </div>
  );
}

const SIZE_LABELS: Record<string, [string, string, string]> = {
  cylinder: ['Diameter', 'Height', 'Diameter'],
  sphere: ['Diameter', 'Diameter', 'Diameter'],
  wall: ['Thickness (X)', 'Height', 'Width (Z)'],
  default: ['Width (X)', 'Height', 'Depth (Z)'],
};

function ObjectInspector({ object }: { object: EnvironmentObject }) {
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(object.name);
  const run = (result: EnvResult<unknown>) => setError(result.ok ? null : result.errors.join(' '));
  const update = (patch: Partial<EnvironmentObject>, label?: string) => run(updateObject(object.id, patch, label));
  const locked = object.locked;
  const t = 'env-insp';
  const labels = SIZE_LABELS[object.shape ?? ''] ?? SIZE_LABELS[object.kind] ?? SIZE_LABELS.default!;
  const sizeField = (i: 0 | 1 | 2) => (
    <Line label={labels[i]} hint="m" key={i}>
      <NumberField
        label={['X', 'Y', 'Z'][i]!}
        value={object.size[i]}
        step={0.05}
        decimals={3}
        min={ENV_LIMITS.size.min}
        testId={`${t}-size-${i}`}
        onCommit={(v) => {
          const size = [...object.size] as Vec3;
          size[i] = v;
          update({ size: normalizeSize(object, size) }, `Resize ${object.name}`);
        }}
      />
    </Line>
  );
  const sizeIndexes: (0 | 1 | 2)[] = object.shape === 'sphere' ? [0] : object.shape === 'cylinder' ? [0, 1] : [0, 1, 2];

  return (
    <div data-testid="environment-object-inspector" data-locked={locked}>
      <Section
        title="Object"
        action={
          <button type="button" className={cn('inline-flex items-center gap-1 text-[11px]', locked ? 'text-warn' : 'text-muted hover:text-ink')} onClick={() => update({ locked: !locked }, `${locked ? 'Unlock' : 'Lock'} ${object.name}`)} data-testid={`${t}-lock`}>
            {locked ? <Lock size={11} /> : <Unlock size={11} />} {locked ? 'Locked' : 'Lock'}
          </button>
        }
      >
        <input
          className="h-7 w-full rounded-md border border-line bg-raised px-2 text-[12.5px] font-semibold text-ink disabled:opacity-60"
          value={name}
          disabled={locked}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name !== object.name && update({ name }, `Rename ${object.name} to ${name}`)}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          data-testid={`${t}-name`}
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Badge tone="accent">{KIND_LABEL[object.kind]}</Badge>
          {object.shape && <Badge>{object.shape}</Badge>}
          <Badge tone={object.body === 'dynamic' ? 'warn' : 'neutral'}>{object.body}</Badge>
          {!object.collision && <Badge tone="warn">no collision</Badge>}
        </div>
        <p className="mt-1.5 font-mono text-[10px] text-faint">{object.id}</p>
        {locked && <p className="mt-1.5 text-[11px] text-warn">Locked: unlock to move or edit it.</p>}
      </Section>

      <fieldset disabled={locked} className="disabled:opacity-60">
        <Section
          title="Transform"
          action={
            <button type="button" className="inline-flex items-center gap-1 text-[11px] text-muted hover:text-ink" onClick={() => update({ rotation: [0, 0, 0] }, `Reset rotation of ${object.name}`)} data-testid={`${t}-reset-transform`}>
              <RotateCcw size={11} /> Reset rotation
            </button>
          }
        >
          <VectorRow label="Position" unit="m" values={object.position} step={0.05} decimals={3} testId={`${t}-pos`} onCommit={(v: Vec3) => update({ position: v }, `Move ${object.name}`)} />
          <VectorRow
            label="Rotation"
            unit="deg"
            values={[object.rotation[0] * RAD_TO_DEG, object.rotation[1] * RAD_TO_DEG, object.rotation[2] * RAD_TO_DEG]}
            step={5}
            decimals={1}
            testId={`${t}-rot`}
            onCommit={(v: Vec3) => update({ rotation: [v[0] * DEG_TO_RAD, v[1] * DEG_TO_RAD, v[2] * DEG_TO_RAD] }, `Rotate ${object.name}`)}
          />
        </Section>

        <Section title="Dimensions">
          {sizeIndexes.map(sizeField)}
          {object.kind === 'ramp' && (
            <Line label="Inclination" hint="°">
              <NumberField
                label="∠"
                value={rampInclination(object.size) * RAD_TO_DEG}
                step={1}
                decimals={1}
                min={1}
                testId={`${t}-incline`}
                onCommit={(deg) => update({ size: [object.size[0], rampHeightFor(object.size, Math.min(deg, 60) * DEG_TO_RAD), object.size[2]] }, `Incline ${object.name}`)}
              />
            </Line>
          )}
        </Section>

        <Section title="Physics">
          <Line label="Body">
            <select
              className="h-6 rounded-md border border-line bg-raised px-1.5 text-[11px] text-ink"
              value={object.body}
              onChange={(e) => update({ body: e.target.value as 'static' | 'dynamic' }, `Make ${object.name} ${e.target.value}`)}
              disabled={object.kind === 'ground'}
              data-testid={`${t}-body`}
            >
              <option value="static">Static (fixed)</option>
              <option value="dynamic">Dynamic (movable)</option>
            </select>
          </Line>
          {object.body === 'dynamic' && (
            <Line label="Mass" hint="kg">
              <NumberField label="kg" value={object.mass} step={0.1} decimals={3} min={ENV_LIMITS.mass.min} testId={`${t}-mass`} onCommit={(v) => update({ mass: v })} />
            </Line>
          )}
          <Line label="Friction">
            <NumberField label="μ" value={object.friction} step={0.05} decimals={2} min={0} testId={`${t}-friction`} onCommit={(v) => update({ friction: v }, `Friction of ${object.name}`)} />
          </Line>
          <Line label="Bounciness">
            <NumberField label="e" value={object.restitution} step={0.05} decimals={2} min={0} testId={`${t}-restitution`} onCommit={(v) => update({ restitution: v })} />
          </Line>
          <Line label="Collision">
            <input type="checkbox" className="justify-self-end accent-[#3B82F6]" checked={object.collision} onChange={(e) => update({ collision: e.target.checked }, `${e.target.checked ? 'Enable' : 'Disable'} collision of ${object.name}`)} data-testid={`${t}-collision`} />
          </Line>
          <p className="text-[10.5px] text-faint">
            Collider: {object.kind === 'ramp' ? 'wedge (6-point convex hull)' : object.shape === 'cylinder' ? 'cylinder' : object.shape === 'sphere' ? 'sphere' : 'box'}, the same size as drawn.
            {object.kind === 'ground' ? ' Ground planes are static; sensors that ignore the ground do not see them.' : ''}
          </p>
        </Section>

        <Section title="Appearance">
          <Line label="Color">
            <input type="color" className="h-6 w-full rounded border border-line bg-raised" value={object.color} onChange={(e) => update({ color: e.target.value }, `Color of ${object.name}`)} />
          </Line>
          <Line label="Visible">
            <input type="checkbox" className="justify-self-end accent-[#3B82F6]" checked={object.visible} onChange={(e) => update({ visible: e.target.checked }, `${e.target.checked ? 'Show' : 'Hide'} ${object.name}`)} />
          </Line>
        </Section>
      </fieldset>

      {error && (
        <p className="mx-3 mt-2 rounded-md bg-err/10 p-2 text-[11px] text-err" data-testid={`${t}-error`}>
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-1.5 p-3">
        <Button size="sm" icon={<Copy size={13} />} onClick={() => run(duplicateObject(object.id))} data-testid={`${t}-duplicate`}>
          Duplicate
        </Button>
        <Button size="sm" variant="danger" icon={<Trash2 size={13} />} onClick={() => run(removeObject(object.id))} disabled={locked} data-testid={`${t}-delete`}>
          Delete
        </Button>
      </div>
    </div>
  );
}

function EnvironmentSummary() {
  const draft = useEnvironmentStore((s) => s.draft)!;
  const dirty = useEnvironmentStore((s) => s.dirty);
  const saved = useEnvironmentStore((s) => Boolean(s.environments[draft.id]));
  const [name, setName] = useState(draft.name);
  const [error, setError] = useState<string | null>(null);
  const template = draft.templateId ? findTemplate(draft.templateId) : undefined;
  const problems = validateEnvironment(draft);
  const hasGround = draft.objects.some((o) => o.kind === 'ground');
  return (
    <div data-testid="environment-summary">
      <Section title="Environment">
        <input
          className="h-7 w-full rounded-md border border-line bg-raised px-2 text-[12.5px] font-semibold text-ink"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            const result = renameEnvironment(name);
            setError(result.ok ? null : result.errors.join(' '));
            if (!result.ok) setName(draft.name);
          }}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          data-testid="env-name-input"
        />
        <dl className="mt-2 grid grid-cols-2 gap-y-0.5 text-xs">
          <dt className="text-faint">Objects</dt>
          <dd className="text-right">{draft.objects.length}</dd>
          <dt className="text-faint">Template</dt>
          <dd className="text-right">{template?.name ?? '—'}</dd>
          <dt className="text-faint">Floor</dt>
          <dd className="text-right">{hasGround ? 'Ground objects' : 'Default floor'}</dd>
          <dt className="text-faint">Status</dt>
          <dd className={cn('text-right', dirty ? 'text-warn' : 'text-ok')}>{!saved ? 'Not saved yet' : dirty ? 'Unsaved changes' : 'Saved'}</dd>
        </dl>
        {error && <p className="mt-2 text-[11px] text-err">{error}</p>}
        {template && (
          <Button size="sm" variant="ghost" className="mt-2 w-full" icon={<RotateCcw size={12} />} onClick={() => resetToTemplate()} data-testid="env-reset-template-inspector">
            Restore template objects
          </Button>
        )}
      </Section>
      <Section title="Validation">
        {problems.length === 0 ? (
          <p className="text-[11px] text-ok" data-testid="env-valid">No problems.</p>
        ) : (
          <ul className="space-y-1 text-[11px] text-err">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
      </Section>
      <p className="px-3 py-3 text-xs text-muted">Select an object in the 3D view or the Objects list to edit it.</p>
    </div>
  );
}

/** Right panel in the Environment Editor. */
export function EnvironmentInspector() {
  const draft = useEnvironmentStore((s) => s.draft);
  const selectedId = useEnvironmentStore((s) => s.selectedId);
  const object = draft?.objects.find((o) => o.id === selectedId);
  if (!draft) return <p className="p-3 text-xs text-muted">No environment open. Create one or open a saved environment in the left panel.</p>;
  return object ? <ObjectInspector key={object.id + JSON.stringify(object)} object={object} /> : <EnvironmentSummary key={draft.id + draft.name} />;
}
