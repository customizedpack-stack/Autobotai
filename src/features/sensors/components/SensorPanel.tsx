import { Eye, EyeOff, Gauge, RotateCcw } from 'lucide-react';
import { useSceneStore } from '../../../stores/sceneStore';
import { useWorkspaceStore } from '../../../stores/workspaceStore';
import { cn } from '../../../utils/cn';
import { robotModel } from '../../robot-model/robotModelConnector';
import { resetAllEncoders } from '../core/sensorManager';
import { useSensorStore } from '../core/sensorStore';
import { primaryValue, readingStatus } from './format';

const DOT = { ok: 'bg-ok', warn: 'bg-warn', err: 'bg-err', neutral: 'bg-faint' } as const;

/** Compact sensor readings in the Robot Control panel (Control Mode and Code Studio). */
export function SensorPanel() {
  const sensors = useSceneStore((s) => s.sensors);
  const readings = useSensorStore((s) => s.readings);
  const stream = useSensorStore((s) => s.stream);
  const showRays = useSensorStore((s) => s.showRays);
  const setStore = useSensorStore((s) => s.set);
  const openMonitor = () => {
    useWorkspaceStore.getState().setBottomTab('sensors');
    useWorkspaceStore.getState().setPanelCollapsed('bottom', false);
  };
  if (sensors.length === 0) {
    return (
      <div className="text-[11px] text-muted" data-testid="sensor-panel">
        No sensors.{' '}
        <button type="button" className="text-accent hover:underline" onClick={() => robotModel.addDefaultSensors()} data-testid="panel-add-default-sensors">
          Add default sensors
        </button>
      </div>
    );
  }
  return (
    <div data-testid="sensor-panel" data-stream={stream}>
      <ul className="space-y-1">
        {sensors.map((s) => {
          const status = readingStatus(readings[s.id], s.enabled);
          return (
            <li key={s.id} className="flex items-center gap-2 text-[11px]" data-testid={`panel-sensor-${s.id}`}>
              <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', DOT[status.tone])} title={status.label} />
              <span className="min-w-0 flex-1 truncate text-muted">{s.name}</span>
              <span className="font-mono text-ink" data-testid={`panel-sensor-${s.id}-value`}>
                {s.enabled ? primaryValue(readings[s.id]) : 'off'}
              </span>
            </li>
          );
        })}
      </ul>
      {stream === 'off' && <p className="mt-1.5 text-[10.5px] text-faint">Start the simulation to read sensors.</p>}
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
        <button type="button" className="inline-flex items-center gap-1 text-muted hover:text-ink" onClick={openMonitor} data-testid="open-sensor-monitor">
          <Gauge size={11} /> Monitor
        </button>
        <button type="button" className="inline-flex items-center gap-1 text-muted hover:text-ink disabled:opacity-40" onClick={resetAllEncoders} disabled={stream === 'off'} data-testid="panel-reset-encoders">
          <RotateCcw size={11} /> Reset encoders
        </button>
        <button type="button" className="inline-flex items-center gap-1 text-muted hover:text-ink" onClick={() => setStore({ showRays: !showRays })} aria-pressed={showRays} data-testid="toggle-sensor-rays">
          {showRays ? <Eye size={11} /> : <EyeOff size={11} />} Rays
        </button>
      </div>
    </div>
  );
}
