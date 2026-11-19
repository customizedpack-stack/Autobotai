import type { ReactNode } from 'react';
import { Atom, Bug, Pause, Play, RotateCcw, Square, Zap } from 'lucide-react';
import { Button } from '../../../components/common/Button';
import { robotControl } from '../../controls/robotControlApi';
import { cn } from '../../../utils/cn';
import { environmentList, useEnvironmentStore } from '../../environment/store/environmentStore';
import { editCurrentEnvironment } from '../../environment/environmentSession';
import { pauseSimulation, resumeSimulation, selectEngine, setDebugView, setEnvironment, setGravityEnabled, startSimulation, stopSimulation } from '../simulation/simulationManager';
import { useSimulationStore, type SimulationEngine } from '../simulation/simulationStore';

const ENGINES: { id: SimulationEngine; label: string; hint: string }[] = [
  { id: 'kinematic', label: 'Kinematic', hint: 'Direct movement (Phase 3). No mass, gravity or collisions.' },
  { id: 'physics', label: 'Physics', hint: 'Rapier rigid-body physics: mass, gravity, friction, motors and collisions.' },
];

const STATE_LABEL = { stopped: 'Stopped', starting: 'Starting…', running: 'Running', paused: 'Paused' } as const;
const STATE_TONE = { stopped: 'text-faint', starting: 'text-warn', running: 'text-ok', paused: 'text-warn' } as const;

function Toggle({ label, checked, onChange, testId, icon }: { label: string; checked: boolean; onChange: (v: boolean) => void; testId: string; icon: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-2 text-[11px] text-muted">
      <span className="flex items-center gap-1.5">
        {icon}
        {label}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        data-testid={testId}
        onClick={() => onChange(!checked)}
        className={cn('relative h-4 w-7 shrink-0 rounded-full transition-colors', checked ? 'bg-accent' : 'bg-line')}
      >
        <span className={cn('absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all', checked ? 'left-3.5' : 'left-0.5')} />
      </button>
    </label>
  );
}

/**
 * Simulation panel (Control Mode and Code Studio): engine selector, lifecycle
 * controls, physics settings and live info. Every action goes through the
 * simulation manager; Reset goes through C2 like everywhere else.
 */
export function SimulationPanel() {
  const engine = useSimulationStore((s) => s.engine);
  const state = useSimulationStore((s) => s.state);
  const settings = useSimulationStore((s) => s.settings);
  const info = useSimulationStore((s) => s.info);
  const error = useSimulationStore((s) => s.error);
  // Re-render when saved environments change (the list in the environment menu).
  useEnvironmentStore((s) => s.environments);
  const physics = engine === 'physics';
  const active = state === 'running' || state === 'paused';

  return (
    <div data-testid="simulation-panel" data-engine={engine} data-state={state}>
      <div className="grid grid-cols-2 gap-1 rounded-md border border-line p-0.5" role="radiogroup" aria-label="Simulation engine">
        {ENGINES.map((e) => (
          <button
            key={e.id}
            type="button"
            role="radio"
            aria-checked={engine === e.id}
            title={e.hint}
            data-testid={`engine-${e.id}`}
            disabled={state === 'starting'}
            onClick={() => void selectEngine(e.id)}
            className={cn(
              'flex h-7 items-center justify-center gap-1.5 rounded text-[11.5px] font-medium transition-colors disabled:opacity-50',
              engine === e.id ? (e.id === 'physics' ? 'bg-ok/20 text-ok' : 'bg-accent-soft text-ink') : 'text-muted hover:text-ink',
            )}
          >
            {e.id === 'physics' ? <Atom size={12} /> : <Zap size={12} />}
            {e.label}
          </button>
        ))}
      </div>

      {!physics ? (
        <p className="mt-2 text-[10.5px] leading-relaxed text-faint" data-testid="engine-note">
          Kinematic: the robot follows commands exactly, with no mass, gravity or collisions. Choose Physics for a realistic simulation.
        </p>
      ) : (
        <>
          <div className="mt-2 flex items-center justify-between text-[11px]">
            <span className="text-faint">Status</span>
            <span className={cn('font-mono font-medium', STATE_TONE[state])} data-testid="sim-state">
              {STATE_LABEL[state]}
            </span>
          </div>
          <div className="mt-2 grid grid-cols-4 gap-1">
            {state === 'stopped' || state === 'starting' ? (
              <Button size="sm" variant="primary" icon={<Play size={12} />} onClick={() => void startSimulation()} disabled={state === 'starting'} data-testid="sim-start" title="Start the physics simulation">
                Start
              </Button>
            ) : state === 'running' ? (
              <Button size="sm" icon={<Pause size={12} />} onClick={() => pauseSimulation()} data-testid="sim-pause" title="Freeze simulation time">
                Pause
              </Button>
            ) : (
              <Button size="sm" variant="primary" icon={<Play size={12} />} onClick={() => resumeSimulation()} data-testid="sim-resume" title="Continue the simulation">
                Resume
              </Button>
            )}
            <Button size="sm" variant="danger" icon={<Square size={11} />} onClick={() => stopSimulation()} disabled={!active} data-testid="sim-stop" title="Stop and return to the design pose">
              Stop
            </Button>
            <Button size="sm" icon={<RotateCcw size={12} />} onClick={() => robotControl.reset('panel')} disabled={!active} data-testid="sim-reset" className="col-span-2" title="Rebuild the simulation from the design pose">
              Reset
            </Button>
          </div>

          <div className="mt-3 space-y-2">
            <Toggle label="Gravity" checked={settings.gravityEnabled} onChange={setGravityEnabled} testId="sim-gravity" icon={<span className="font-mono text-[10px]">g</span>} />
            <Toggle label="Debug view" checked={settings.debug} onChange={setDebugView} testId="sim-debug" icon={<Bug size={11} />} />
            <label className="flex items-center justify-between gap-2 text-[11px] text-muted">
              Environment
              <select
                value={settings.environment}
                onChange={(e) => setEnvironment(e.target.value)}
                data-testid="sim-environment"
                className="h-6 rounded-md border border-line bg-raised px-1.5 text-[11px] text-ink"
              >
                {environmentList().map((env) => (
                  <option key={env.id} value={env.id}>
                    {env.name}
                    {env.template ? '' : ' (mine)'}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="text-[11px] text-accent hover:underline" onClick={editCurrentEnvironment} data-testid="sim-edit-environment">
              Edit this environment →
            </button>
          </div>

          {active && (
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-0.5 font-mono text-[10.5px]" data-testid="sim-info">
              <dt className="text-faint">Bodies / joints</dt>
              <dd className="text-right">
                {info.bodies} / {info.joints}
              </dd>
              <dt className="text-faint">Total mass</dt>
              <dd className="text-right" data-testid="sim-mass">{info.totalMass.toFixed(2)} kg</dd>
              <dt className="text-faint">Sim time</dt>
              <dd className="text-right" data-testid="sim-time">{info.simTime.toFixed(1)} s</dd>
              <dt className="text-faint">Step cost</dt>
              <dd className="text-right">{info.stepMs.toFixed(2)} ms</dd>
              <dt className="text-faint">Awake bodies</dt>
              <dd className="text-right">{info.awake}</dd>
            </dl>
          )}
          {settings.debug && active && (
            <p className="mt-2 text-[10px] leading-relaxed text-faint">
              Debug: <span className="text-[#e879f9]">collision shapes</span> · <span className="text-[#facc15]">joints</span> · <span className="text-[#22d3ee]">velocity</span> · <span className="text-[#ef4444]">contacts</span>
            </p>
          )}
          {info.issues.length > 0 && (
            <ul className="mt-2 space-y-1 rounded-md bg-warn/10 p-2 text-[10.5px] text-warn" data-testid="sim-issues">
              {info.issues.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          )}
        </>
      )}
      {error && (
        <p className="mt-2 rounded-md bg-err/10 p-2 text-[11px] text-err" data-testid="sim-error">
          {error}
        </p>
      )}
    </div>
  );
}
