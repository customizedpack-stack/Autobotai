import { useState, type ReactNode } from 'react';
import { ArrowRight, Trash2 } from 'lucide-react';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { useSceneStore } from '../../stores/sceneStore';
import { useSelectionStore } from '../../stores/selectionStore';
import { useSettingsStore } from '../../stores/settingsStore';
import type { JointType, RobotJoint } from '../../types/joint';
import type { Vec3 } from '../../types/scene';
import { cn } from '../../utils/cn';
import { DEG_TO_RAD, RAD_TO_DEG } from '../../utils/math';
import { deleteSelected } from '../projects/workspaceActions';
import { DEFAULT_LIMITS, JOINT_TYPES } from '../robot-model/joints';
import { robotModel } from '../robot-model/robotModelConnector';
import { JOINT_COLORS } from '../viewport/jointStyle';
import { NumberField } from './NumberField';
import { VectorRow } from './VectorRow';

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

function JointNameField({ joint }: { joint: RobotJoint }) {
  const [text, setText] = useState(joint.name);
  return (
    <input
      value={text}
      aria-label="Joint name"
      data-testid="joint-name"
      onChange={(e) => setText(e.target.value)}
      onBlur={() => (text.trim() ? robotModel.updateJoint(joint.id, { name: text.trim() }) : setText(joint.name))}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          setText(joint.name);
          e.currentTarget.blur();
        }
      }}
      className="h-8 w-full rounded-md border border-line bg-app px-2 text-[13px] font-medium outline-none focus:border-accent"
    />
  );
}

const AXES: { label: string; value: Vec3 }[] = [
  { label: 'X', value: [1, 0, 0] },
  { label: 'Y', value: [0, 1, 0] },
  { label: 'Z', value: [0, 0, 1] },
];

/** Properties of the selected joint. Every edit goes through the C1 connector. */
export function JointInspector({ joint }: { joint: RobotJoint }) {
  const objects = useSceneStore((s) => s.objects);
  const select = useSelectionStore((s) => s.select);
  const rotationUnit = useSettingsStore((s) => s.rotationUnit);
  const positionStep = useSettingsStore((s) => s.positionStep);
  const parent = objects.find((o) => o.id === joint.parentId);
  const child = objects.find((o) => o.id === joint.childId);
  const inDegrees = rotationUnit === 'deg';
  const angular = joint.type === 'revolute';
  const toDisplay = (v: number) => (angular && inDegrees ? v * RAD_TO_DEG : v);
  const fromDisplay = (v: number) => (angular && inDegrees ? v * DEG_TO_RAD : v);
  const limitUnit = joint.type === 'prismatic' ? 'm' : inDegrees ? 'deg' : 'rad';
  const originRotation: Vec3 = inDegrees ? (joint.origin.rotation.map((v) => v * RAD_TO_DEG) as Vec3) : joint.origin.rotation;

  const update = (patch: Parameters<typeof robotModel.updateJoint>[1]) => robotModel.updateJoint(joint.id, patch);

  const setType = (type: JointType) => {
    if (type === joint.type) return;
    update({ type, limits: { ...DEFAULT_LIMITS[type] } });
  };

  return (
    <div data-testid="joint-inspector">
      <Section title="Joint">
        <JointNameField key={`${joint.id}:${joint.name}`} joint={joint} />
        <div className="mt-2 flex items-center gap-1.5">
          <Badge tone="accent">Joint</Badge>
          <span className="h-2 w-2 rounded-full" style={{ background: JOINT_COLORS[joint.type] }} />
          <span className="text-[11px] text-muted">{JOINT_TYPES.find((t) => t.id === joint.type)?.description}</span>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-1" role="group" aria-label="Joint type">
          {JOINT_TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={joint.type === t.id}
              onClick={() => setType(t.id)}
              data-testid={`joint-type-${t.id}`}
              className={cn('h-7 rounded-md border text-[11px]', joint.type === t.id ? 'border-accent bg-accent-soft text-ink' : 'border-line text-muted hover:text-ink')}
            >
              {t.label}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Connection">
        <div className="flex items-center gap-2 text-xs">
          <button type="button" onClick={() => parent && select(parent.id)} className="min-w-0 flex-1 truncate rounded-md border border-line px-2 py-1.5 text-left hover:border-accent" title="Select parent">
            <span className="block text-[10px] text-faint">Parent</span>
            {parent?.name ?? 'Missing'}
          </button>
          <ArrowRight size={13} className="shrink-0 text-faint" />
          <button type="button" onClick={() => child && select(child.id)} className="min-w-0 flex-1 truncate rounded-md border border-line px-2 py-1.5 text-left hover:border-accent" title="Select child">
            <span className="block text-[10px] text-faint">Child</span>
            {child?.name ?? 'Missing'}
          </button>
        </div>
      </Section>

      <Section title={joint.type === 'fixed' ? 'Axis (not used by fixed joints)' : 'Axis'}>
        <div className="mb-2 flex gap-1">
          {AXES.map((a) => (
            <button
              key={a.label}
              type="button"
              onClick={() => update({ axis: a.value })}
              aria-pressed={a.value.every((v, i) => Math.abs(v - joint.axis[i]) < 1e-9)}
              data-testid={`joint-axis-${a.label.toLowerCase()}`}
              className={cn(
                'h-6 flex-1 rounded border text-[11px] font-semibold',
                a.value.every((v, i) => Math.abs(v - joint.axis[i]) < 1e-9) ? 'border-accent bg-accent-soft text-ink' : 'border-line text-muted hover:text-ink',
              )}
            >
              {a.label}
            </button>
          ))}
        </div>
        <VectorRow label="Direction (normalized)" unit="unit" values={joint.axis} step={0.1} decimals={3} testId="jaxis" onCommit={(v) => update({ axis: v })} />
      </Section>

      <Section title="Origin (in parent frame)">
        <VectorRow
          label="Position"
          unit="m"
          values={joint.origin.position}
          step={positionStep}
          decimals={3}
          testId="jpos"
          onCommit={(v) => update({ origin: { ...joint.origin, position: v } })}
        />
        <VectorRow
          label="Rotation"
          unit={inDegrees ? 'deg' : 'rad'}
          values={originRotation}
          step={inDegrees ? 5 : 0.05}
          decimals={inDegrees ? 1 : 3}
          testId="jrot"
          onCommit={(v) => update({ origin: { ...joint.origin, rotation: inDegrees ? (v.map((x) => x * DEG_TO_RAD) as Vec3) : v } })}
        />
      </Section>

      {joint.type !== 'fixed' && (
        <Section title="Limits">
          <div className="mb-1 flex justify-between text-[11px] text-muted">
            <span>Lower / Upper</span>
            <span className="font-mono text-[10px] text-faint">{limitUnit}</span>
          </div>
          <div className="grid grid-cols-2 gap-1">
            <NumberField
              label="L"
              value={toDisplay(joint.limits.lower)}
              step={angular ? (inDegrees ? 5 : 0.05) : positionStep}
              decimals={angular && inDegrees ? 1 : 3}
              testId="joint-lower"
              onCommit={(v) => update({ limits: { ...joint.limits, lower: fromDisplay(v) } })}
            />
            <NumberField
              label="U"
              value={toDisplay(joint.limits.upper)}
              step={angular ? (inDegrees ? 5 : 0.05) : positionStep}
              decimals={angular && inDegrees ? 1 : 3}
              testId="joint-upper"
              onCommit={(v) => update({ limits: { ...joint.limits, upper: fromDisplay(v) } })}
            />
          </div>
          <p className="mt-2 text-[10.5px] text-faint">Limits are stored now and enforced by the physics engine in Phase 5.</p>
        </Section>
      )}

      <div className="p-3">
        <Button size="sm" variant="danger" icon={<Trash2 size={13} />} onClick={deleteSelected} data-testid="delete-joint">
          Delete joint
        </Button>
      </div>
    </div>
  );
}
