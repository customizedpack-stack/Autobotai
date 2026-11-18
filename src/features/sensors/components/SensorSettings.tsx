import { useState, type ReactNode } from 'react';
import { Trash2 } from 'lucide-react';
import { useSceneStore } from '../../../stores/sceneStore';
import { SENSOR_RATES, type RobotSensor, type SensorRate } from '../../../types/sensor';
import type { Vec3 } from '../../../types/scene';
import { cn } from '../../../utils/cn';
import { DEG_TO_RAD, RAD_TO_DEG } from '../../../utils/math';
import { NumberField } from '../../inspector/NumberField';
import { VectorRow } from '../../inspector/VectorRow';
import { robotModel } from '../../robot-model/robotModelConnector';
import { SENSOR_LIMITS } from '../config/sensorConfig';

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="grid grid-cols-[1fr_120px] items-center gap-2 py-0.5 text-xs">
      <span className="text-faint">
        {label} {hint && <span className="text-[10px] text-faint/70">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

const selectClass = 'h-6 w-full rounded-md border border-line bg-raised px-1.5 text-[11px] text-ink';

/**
 * Settings of one sensor (Build Mode inspector). Every change goes through the C1
 * connector (validated, one undo step); a rejected value shows the reason here.
 */
export function SensorSettings({ sensor }: { sensor: RobotSensor }) {
  const objects = useSceneStore((s) => s.objects);
  const joints = useSceneStore((s) => s.joints);
  const [error, setError] = useState<string | null>(null);
  const [idText, setIdText] = useState(sensor.id);
  const [nameText, setNameText] = useState(sensor.name);
  const update = (patch: Partial<RobotSensor>) => {
    const result = robotModel.updateSensor(sensor.id, patch);
    setError(result.ok ? null : result.errors.join(' '));
    return result.ok;
  };
  const t = `sensor-${sensor.id}`;
  const parts = objects.filter((o) => o.category !== 'joint');

  return (
    <div className="space-y-1 pt-1" data-testid={`${t}-settings`}>
      <Field label="Name">
        <input
          className={selectClass}
          value={nameText}
          onChange={(e) => setNameText(e.target.value)}
          onBlur={() => nameText !== sensor.name && !update({ name: nameText }) && setNameText(sensor.name)}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          data-testid={`${t}-name`}
        />
      </Field>
      <Field label="Id" hint="used by programs">
        <input
          className={cn(selectClass, 'font-mono')}
          value={idText}
          onChange={(e) => setIdText(e.target.value)}
          onBlur={() => idText !== sensor.id && !update({ id: idText }) && setIdText(sensor.id)}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          data-testid={`${t}-id`}
        />
      </Field>
      <Field label="Update rate">
        <select className={selectClass} value={sensor.rateHz} onChange={(e) => update({ rateHz: Number(e.target.value) as SensorRate })} data-testid={`${t}-rate`}>
          {SENSOR_RATES.map((r) => (
            <option key={r} value={r}>
              {r} Hz
            </option>
          ))}
        </select>
      </Field>

      {(sensor.type === 'distance' || sensor.type === 'imu') && (
        <>
          <Field label={sensor.type === 'imu' ? 'Fixed to' : 'Mounted on'}>
            <select className={selectClass} value={sensor.partId} onChange={(e) => update({ partId: e.target.value })} data-testid={`${t}-part`}>
              {!parts.some((p) => p.id === sensor.partId) && <option value={sensor.partId}>⚠ missing part</option>}
              {parts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <VectorRow label="Position" unit="m" values={sensor.position} step={0.01} decimals={3} testId={`${t}-pos`} onCommit={(v: Vec3) => update({ position: v })} />
          <VectorRow
            label="Rotation"
            unit="deg"
            values={[sensor.rotation[0] * RAD_TO_DEG, sensor.rotation[1] * RAD_TO_DEG, sensor.rotation[2] * RAD_TO_DEG]}
            step={5}
            decimals={1}
            testId={`${t}-rot`}
            onCommit={(v: Vec3) => update({ rotation: [v[0] * DEG_TO_RAD, v[1] * DEG_TO_RAD, v[2] * DEG_TO_RAD] })}
          />
        </>
      )}

      {sensor.type === 'distance' && (
        <>
          <Field label="Min range" hint="m">
            <NumberField label="min" value={sensor.minRange} step={0.01} decimals={3} min={0} testId={`${t}-min`} onCommit={(v) => update({ minRange: v })} />
          </Field>
          <Field label="Max range" hint="m">
            <NumberField label="max" value={sensor.maxRange} step={0.1} decimals={2} min={0.01} testId={`${t}-max`} onCommit={(v) => update({ maxRange: Math.min(v, SENSOR_LIMITS.range.max) })} />
          </Field>
          <Field label="Rays" hint="1 = single ray">
            <NumberField label="n" value={sensor.rays} step={1} decimals={0} min={1} testId={`${t}-rays`} onCommit={(v) => update({ rays: Math.round(v), ...(Math.round(v) > 1 && sensor.fov === 0 ? { fov: Math.PI / 4 } : {}) })} />
          </Field>
          <Field label="Field of view" hint="°">
            <NumberField label="fov" value={sensor.fov * RAD_TO_DEG} step={5} decimals={1} min={0} testId={`${t}-fov`} onCommit={(v) => update({ fov: Math.min(v, 180) * DEG_TO_RAD })} />
          </Field>
          <Field label="Ignore ground">
            <input type="checkbox" className="justify-self-end accent-[#3B82F6]" checked={sensor.ignoreGround} onChange={(e) => update({ ignoreGround: e.target.checked })} data-testid={`${t}-ground`} />
          </Field>
          <p className="text-[10.5px] text-faint">Looks along its +X axis. No hit returns no distance (null), never 0. Needs the Physics engine.</p>
        </>
      )}

      {sensor.type === 'encoder' && (
        <>
          <Field label="Wheel joint">
            <select className={selectClass} value={sensor.jointId} onChange={(e) => update({ jointId: e.target.value })} data-testid={`${t}-joint`}>
              {!joints.some((j) => j.id === sensor.jointId) && <option value={sensor.jointId}>⚠ missing joint</option>}
              {joints
                .filter((j) => j.type === 'revolute')
                .map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Ticks / revolution">
            <NumberField label="tpr" value={sensor.ticksPerRevolution} step={1} decimals={0} min={1} testId={`${t}-tpr`} onCommit={(v) => update({ ticksPerRevolution: Math.round(v) })} />
          </Field>
          <Field label="Direction">
            <select className={selectClass} value={sensor.invert ? 'inverted' : 'joint'} onChange={(e) => update({ invert: e.target.value === 'inverted' })} data-testid={`${t}-direction`}>
              <option value="joint">+ = joint axis</option>
              <option value="inverted">+ = opposite of axis</option>
            </select>
          </Field>
        </>
      )}

      {sensor.type === 'imu' && (
        <>
          <Field label="Vector frame">
            <select className={selectClass} value={sensor.frame} onChange={(e) => update({ frame: e.target.value as 'sensor' | 'world' })} data-testid={`${t}-frame`}>
              <option value="sensor">Sensor (body)</option>
              <option value="world">World</option>
            </select>
          </Field>
          <p className="text-[10.5px] leading-relaxed text-faint">
            Gravity convention: <b>linearAcceleration</b> has gravity removed (0 at rest); <b>specificForce</b> is what a real accelerometer reads (+9.81 m/s² up at rest).
          </p>
        </>
      )}

      {error && (
        <p className="rounded-md bg-err/10 p-2 text-[11px] text-err" data-testid={`${t}-error`}>
          {error}
        </p>
      )}
      <div className="flex justify-end gap-1 pt-1">
        <button type="button" className="inline-flex items-center gap-1 text-[11px] text-err hover:underline" onClick={() => robotModel.removeSensor(sensor.id)} data-testid={`${t}-remove`}>
          <Trash2 size={11} /> Remove sensor
        </button>
      </div>
    </div>
  );
}
