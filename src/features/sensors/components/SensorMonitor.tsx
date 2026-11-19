import { useMemo } from 'react';
import { RotateCcw } from 'lucide-react';
import { Badge } from '../../../components/common/Badge';
import { Button } from '../../../components/common/Button';
import { useSceneStore } from '../../../stores/sceneStore';
import type { RobotSensor } from '../../../types/sensor';
import { resetAllEncoders } from '../core/sensorManager';
import { useSensorStore } from '../core/sensorStore';
import type { SensorReading } from '../core/sensorTypes';
import { sensorStream } from '../stream/sensorStream';
import { readingLines, readingStatus, sparkValue, TYPE_SHORT } from './format';

/** Small line chart of the last readings (from the bounded history, never more than 120 points). */
function Sparkline({ sensorId }: { sensorId: string }) {
  const values = sensorStream
    .history(sensorId)
    .map(sparkValue)
    .filter((v): v is number => v !== null && Number.isFinite(v));
  if (values.length < 2) return <div className="h-6 w-24" />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values.map((v, i) => `${(i / (values.length - 1)) * 96},${22 - ((v - min) / span) * 20}`).join(' ');
  return (
    <svg width="96" height="24" className="shrink-0" aria-hidden="true">
      <polyline points={points} fill="none" stroke="#14B8A6" strokeWidth="1.25" />
    </svg>
  );
}

function age(reading: SensorReading | undefined): string {
  if (!reading) return '—';
  const ms = performance.now() - reading.timestamp;
  return ms < 1000 ? `${Math.max(0, Math.round(ms))} ms ago` : `${(ms / 1000).toFixed(1)} s ago`;
}

function MonitorCard({ sensor, reading }: { sensor: RobotSensor; reading: SensorReading | undefined }) {
  const status = readingStatus(reading, sensor.enabled);
  return (
    <div className="flex min-w-[250px] flex-1 flex-col rounded-md border border-line-soft bg-app/40 p-2" data-testid={`monitor-${sensor.id}`} data-status={status.label}>
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12px] font-semibold text-ink">{sensor.name}</span>
          <span className="block truncate font-mono text-[10px] text-faint">
            {sensor.id} · {TYPE_SHORT[sensor.type]} · {sensor.rateHz} Hz · {reading?.source ?? '—'}
          </span>
        </span>
        <Badge tone={status.tone}>
          <span data-testid={`monitor-${sensor.id}-status`}>{status.label}</span>
        </Badge>
      </div>
      <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 font-mono text-[10.5px]">
        {readingLines(reading).map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-faint">{label}</dt>
            <dd className="truncate text-right text-ink" data-testid={`monitor-${sensor.id}-${label.toLowerCase().replace(/[^a-z]+/g, '-')}`}>
              {value}
            </dd>
          </div>
        ))}
      </dl>
      {reading && !reading.valid && reading.error && (
        <p className="mt-1 text-[10.5px] text-warn" data-testid={`monitor-${sensor.id}-error`}>
          {reading.error}
        </p>
      )}
      <div className="mt-auto flex items-end justify-between pt-1 text-[10px] text-faint">
        <span>Updated {age(reading)}</span>
        <Sparkline sensorId={sensor.id} />
      </div>
    </div>
  );
}

/**
 * Sensor Monitor (bottom panel tab): every sensor with its latest reading, status,
 * rate, age and a short history. Reads the UI snapshot, which the sensor manager
 * refreshes at most 10 times per second.
 */
export function SensorMonitor() {
  const all = useSceneStore((s) => s.sensors);
  const sensors = useMemo(() => all.filter((s) => s.type !== 'camera'), [all]);
  const cameras = all.length - sensors.length;
  const stream = useSensorStore((s) => s.stream);
  const source = useSensorStore((s) => s.source);
  const readings = useSensorStore((s) => s.readings);
  const odometry = useSensorStore((s) => s.odometry);
  return (
    <div className="flex h-full flex-col overflow-auto p-2" data-testid="sensor-monitor" data-stream={stream}>
      <div className="mb-2 flex items-center gap-3 text-[11px]">
        <span className="text-muted">
          Stream:{' '}
          <span data-testid="sensor-stream-state" className={stream === 'running' ? 'text-ok' : stream === 'paused' ? 'text-warn' : 'text-faint'}>
            {stream === 'off' ? 'off' : `${stream} (${source})`}
          </span>
        </span>
        {odometry && (
          <span className="font-mono text-[10.5px] text-muted" data-testid="sensor-odometry">
            Odometry (estimate): {odometry.available ? `${odometry.distance.toFixed(3)} m, heading ${((odometry.heading * 180) / Math.PI).toFixed(1)}°` : odometry.reason}
          </span>
        )}
        <Button size="sm" variant="ghost" className="ml-auto" icon={<RotateCcw size={11} />} onClick={resetAllEncoders} disabled={stream === 'off'} data-testid="monitor-reset-encoders">
          Reset encoders
        </Button>
      </div>
      {stream === 'off' && (
        <p className="mb-2 text-[11px] text-faint">Sensors run in Control Mode and Code Studio. With the Physics engine, start the simulation.</p>
      )}
      {cameras > 0 && <p className="mb-2 text-[11px] text-faint">Camera images are in the Camera tab.</p>}
      {sensors.length === 0 ? (
        <p className="text-xs text-muted">This robot has no sensors. Add them in Build Mode (Inspector → Sensors).</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {sensors.map((s) => (
            <MonitorCard key={s.id} sensor={s} reading={readings[s.id]} />
          ))}
        </div>
      )}
    </div>
  );
}
