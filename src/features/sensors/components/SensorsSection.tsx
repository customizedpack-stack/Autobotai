import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Plus, Radar } from 'lucide-react';
import { Badge } from '../../../components/common/Badge';
import { Button } from '../../../components/common/Button';
import { useSceneStore } from '../../../stores/sceneStore';
import type { RobotSensor, SensorType } from '../../../types/sensor';
import { cn } from '../../../utils/cn';
import { robotModel } from '../../robot-model/robotModelConnector';
import { defaultSensorsFor } from '../config/sensorConfig';
import { addSensorOfType } from './addSensor';
import { TYPE_SHORT } from './format';
import { SensorSettings } from './SensorSettings';

function EnabledSwitch({ sensor }: { sensor: RobotSensor }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={sensor.enabled}
      aria-label={`${sensor.enabled ? 'Disable' : 'Enable'} ${sensor.name}`}
      data-testid={`sensor-${sensor.id}-enabled`}
      onClick={(e) => {
        e.stopPropagation();
        robotModel.updateSensor(sensor.id, { enabled: !sensor.enabled });
      }}
      className={cn('relative h-4 w-7 shrink-0 rounded-full transition-colors', sensor.enabled ? 'bg-accent' : 'bg-line')}
    >
      <span className={cn('absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all', sensor.enabled ? 'left-3.5' : 'left-0.5')} />
    </button>
  );
}

/** One sensor row with its settings folded out underneath. */
export function SensorRow({ sensor, open, onToggle }: { sensor: RobotSensor; open: boolean; onToggle: () => void }) {
  return (
    <li className="rounded-md border border-line-soft" data-testid={`sensor-row-${sensor.id}`}>
      <div className="flex items-center gap-2 px-2 py-1.5">
        <button type="button" onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-[11.5px]" aria-expanded={open} data-testid={`sensor-${sensor.id}-toggle`}>
          {open ? <ChevronDown size={12} className="shrink-0 text-faint" /> : <ChevronRight size={12} className="shrink-0 text-faint" />}
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium text-ink">{sensor.name}</span>
            <span className="block truncate font-mono text-[10px] text-faint">{sensor.id}</span>
          </span>
          <Badge>{TYPE_SHORT[sensor.type]}</Badge>
        </button>
        <EnabledSwitch sensor={sensor} />
      </div>
      {open && (
        <div className="border-t border-line-soft px-2 pb-2">
          <SensorSettings key={sensor.id + JSON.stringify(sensor)} sensor={sensor} />
        </div>
      )}
    </li>
  );
}

/** Inspector section (Build Mode): every sensor of the robot, with add and edit. */
export function SensorsSection() {
  const sensors = useSceneStore((s) => s.sensors);
  const objects = useSceneStore((s) => s.objects);
  const joints = useSceneStore((s) => s.joints);
  const controllers = useSceneStore((s) => s.controllers);
  const [open, setOpen] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const defaults = useMemo(() => defaultSensorsFor({ objects, joints, controllers, sensors }), [objects, joints, controllers, sensors]);
  const add = (type: SensorType) => setMessage(addSensorOfType(type));

  return (
    <section className="border-b border-line-soft px-3 py-3" data-testid="sensors-section">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-[10.5px] font-semibold tracking-wider text-muted uppercase">
          <Radar size={11} /> Sensors ({sensors.length})
        </h3>
      </div>
      {sensors.length === 0 ? (
        <p className="text-xs text-muted">No sensors yet. Sensors read the simulated world: distance (Physics engine), wheel encoders and an IMU.</p>
      ) : (
        <ul className="space-y-1.5">
          {sensors.map((s) => (
            <SensorRow key={s.id} sensor={s} open={open === s.id} onToggle={() => setOpen(open === s.id ? null : s.id)} />
          ))}
        </ul>
      )}
      {defaults.length > 0 && (
        <Button size="sm" className="mt-2 w-full" icon={<Radar size={12} />} onClick={() => setMessage(robotModel.addDefaultSensors().ok ? null : 'Could not add default sensors.')} data-testid="add-default-sensors">
          Add default sensors ({defaults.map((d) => TYPE_SHORT[d.type]).join(', ')})
        </Button>
      )}
      <div className="mt-2 grid grid-cols-3 gap-1">
        {(['distance', 'encoder', 'imu'] as const).map((type) => (
          <Button key={type} size="sm" variant="ghost" icon={<Plus size={11} />} onClick={() => add(type)} data-testid={`add-sensor-${type}`}>
            {TYPE_SHORT[type]}
          </Button>
        ))}
      </div>
      {message && <p className="mt-2 text-[11px] text-err">{message}</p>}
    </section>
  );
}

/** Object inspector: the sensors mounted on this part (or on its joint). */
export function PartSensors({ partId }: { partId: string }) {
  const sensors = useSceneStore((s) => s.sensors);
  const joints = useSceneStore((s) => s.joints);
  const [open, setOpen] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const jointIds = new Set(joints.filter((j) => j.childId === partId).map((j) => j.id));
  const mine = sensors.filter((s) => (s.type === 'encoder' ? jointIds.has(s.jointId) : s.partId === partId));
  const canEncoder = joints.some((j) => j.childId === partId && j.type === 'revolute' && !sensors.some((s) => s.type === 'encoder' && s.jointId === j.id));
  return (
    <div data-testid="part-sensors">
      {mine.length > 0 && (
        <ul className="mb-2 space-y-1.5">
          {mine.map((s) => (
            <SensorRow key={s.id} sensor={s} open={open === s.id} onToggle={() => setOpen(open === s.id ? null : s.id)} />
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-1">
        <Button size="sm" variant="ghost" icon={<Plus size={11} />} onClick={() => setMessage(addSensorOfType('distance', partId))} data-testid="part-add-distance">
          Distance here
        </Button>
        <Button size="sm" variant="ghost" icon={<Plus size={11} />} onClick={() => setMessage(addSensorOfType('imu', partId))} data-testid="part-add-imu">
          IMU here
        </Button>
        {canEncoder && (
          <Button size="sm" variant="ghost" icon={<Plus size={11} />} onClick={() => setMessage(addSensorOfType('encoder', partId))} data-testid="part-add-encoder">
            Encoder on its joint
          </Button>
        )}
      </div>
      {message && <p className="mt-1 text-[11px] text-err">{message}</p>}
    </div>
  );
}
