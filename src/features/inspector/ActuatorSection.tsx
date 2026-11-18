import { useMemo, useState, type ReactNode } from 'react';
import { Cpu, Plus, Trash2 } from 'lucide-react';
import { Button } from '../../components/common/Button';
import { useSceneStore } from '../../stores/sceneStore';
import type { ActuatorType, RobotActuator } from '../../types/actuator';
import type { RobotJoint } from '../../types/joint';
import { cn } from '../../utils/cn';
import { ACTUATOR_TYPES, actuatorTypeInfo, compatibleActuatorTypes } from '../robot-model/actuators';
import { robotModel } from '../robot-model/robotModelConnector';
import { NumberField } from './NumberField';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] text-muted">{label}</span>
      {children}
    </label>
  );
}

const selectClass = 'h-8 w-full rounded-md border border-line bg-app px-2 text-xs outline-none focus:border-accent';

function MotorSelect({ value, onChange, optional, testId }: { value: string; onChange: (v: string) => void; optional: boolean; testId: string }) {
  const objects = useSceneStore((s) => s.objects);
  const motors = useMemo(() => objects.filter((o) => o.category === 'motor'), [objects]);
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={selectClass} aria-label="Motor component" data-testid={testId}>
      <option value="">{optional ? 'None' : 'Choose a motor part…'}</option>
      {motors.map((m) => (
        <option key={m.id} value={m.id}>
          {m.name}
        </option>
      ))}
    </select>
  );
}

function ActuatorEditor({ actuator, joint }: { actuator: RobotActuator; joint: RobotJoint }) {
  const info = actuatorTypeInfo(actuator.type);
  const [name, setName] = useState(actuator.name);
  const angular = joint.type === 'revolute';
  return (
    <div className="space-y-2" data-testid="actuator-editor">
      <Field label="Name">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => (name.trim() ? robotModel.updateActuator(actuator.id, { name: name.trim() }) : setName(actuator.name))}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          className={selectClass}
          aria-label="Actuator name"
        />
      </Field>
      <Field label="Type">
        <select
          value={actuator.type}
          onChange={(e) => robotModel.updateActuator(actuator.id, { type: e.target.value as ActuatorType })}
          className={selectClass}
          aria-label="Actuator type"
          data-testid="actuator-type"
        >
          {compatibleActuatorTypes(joint).map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </Field>
      <p className="text-[10.5px] text-faint">
        {info.description} Control: {info.controlMode === 'velocity' ? 'speed' : 'position'}.
      </p>
      <Field label="Motor part">
        <MotorSelect
          value={actuator.componentId ?? ''}
          optional={!info.needsMotorComponent}
          onChange={(v) => robotModel.updateActuator(actuator.id, { componentId: v || null })}
          testId="actuator-component"
        />
      </Field>
      <div className="grid grid-cols-2 gap-1.5">
        <div>
          <div className="mb-1 flex justify-between text-[11px] text-muted">
            <span>Max torque</span>
            <span className="font-mono text-[10px] text-faint">{angular ? 'N·m' : 'N'}</span>
          </div>
          <NumberField label="τ" value={actuator.maxTorque} step={0.1} decimals={3} testId="actuator-torque" onCommit={(v) => robotModel.updateActuator(actuator.id, { maxTorque: v })} />
        </div>
        <div>
          <div className="mb-1 flex justify-between text-[11px] text-muted">
            <span>Max velocity</span>
            <span className="font-mono text-[10px] text-faint">{angular ? 'rad/s' : 'm/s'}</span>
          </div>
          <NumberField label="v" value={actuator.maxVelocity} step={0.5} decimals={3} testId="actuator-velocity" onCommit={(v) => robotModel.updateActuator(actuator.id, { maxVelocity: v })} />
        </div>
      </div>
      <div className="flex items-center justify-between pt-1">
        <label className="flex items-center gap-2 text-xs">
          <button
            type="button"
            role="switch"
            aria-checked={actuator.enabled}
            aria-label="Actuator enabled"
            data-testid="actuator-enabled"
            onClick={() => robotModel.updateActuator(actuator.id, { enabled: !actuator.enabled })}
            className={cn('relative h-5 w-9 rounded-full transition-colors', actuator.enabled ? 'bg-accent' : 'bg-line')}
          >
            <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all', actuator.enabled ? 'left-[18px]' : 'left-0.5')} />
          </button>
          {actuator.enabled ? 'Enabled' : 'Disabled'}
        </label>
        <Button size="sm" variant="danger" icon={<Trash2 size={12} />} onClick={() => robotModel.deleteActuator(actuator.id)} data-testid="delete-actuator">
          Remove
        </Button>
      </div>
      <p className="text-[10.5px] text-faint">Torque is used by physics in Phase 5. Velocity limits are enforced now.</p>
    </div>
  );
}

function AddActuator({ joint }: { joint: RobotJoint }) {
  const options = compatibleActuatorTypes(joint);
  const [type, setType] = useState<ActuatorType>(options[0]?.id ?? 'jointActuator');
  const [componentId, setComponentId] = useState('');
  const info = ACTUATOR_TYPES.find((t) => t.id === type)!;
  if (options.length === 0) return <p className="text-xs text-muted">Fixed joints cannot be driven, so they have no actuator.</p>;
  return (
    <div className="space-y-2">
      <Field label="Type">
        <select value={type} onChange={(e) => setType(e.target.value as ActuatorType)} className={selectClass} aria-label="New actuator type" data-testid="new-actuator-type">
          {options.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label={info.needsMotorComponent ? 'Motor part' : 'Motor part (optional)'}>
        <MotorSelect value={componentId} onChange={setComponentId} optional={!info.needsMotorComponent} testId="new-actuator-component" />
      </Field>
      <Button size="sm" icon={<Plus size={13} />} onClick={() => robotModel.createActuator({ type, jointId: joint.id, componentId: componentId || null })} data-testid="add-actuator">
        Add actuator
      </Button>
    </div>
  );
}

/** Actuator bound to the selected joint (Build Mode). Every change goes through C1 and is undoable. */
export function ActuatorSection({ joint }: { joint: RobotJoint }) {
  const actuator = useSceneStore((s) => s.actuators.find((a) => a.jointId === joint.id));
  return (
    <section className="border-b border-line-soft px-3 py-3" data-testid="actuator-section">
      <div className="mb-2 flex items-center gap-1.5">
        <Cpu size={12} className="text-faint" />
        <h3 className="text-[10.5px] font-semibold tracking-wider text-muted uppercase">Actuator</h3>
      </div>
      {actuator ? <ActuatorEditor key={`${actuator.id}:${actuator.name}`} actuator={actuator} joint={joint} /> : <AddActuator joint={joint} />}
    </section>
  );
}
