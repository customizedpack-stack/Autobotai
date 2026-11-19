import { useMemo } from 'react';
import { useRobotStateStore } from '../../../stores/robotStateStore';
import { activePhysicsController } from '../../physics/simulation/simulationManager';
import { useSimulationStore } from '../../physics/simulation/simulationStore';
import { KIND_LABEL, validateEnvironment } from '../config/environmentConfig';
import { resolveEnvironment, useEnvironmentStore } from '../store/environmentStore';

/**
 * Bottom panel "Environment" tab: name, object and physics-body counts, simulation
 * status, validation, and — while a simulation runs — the physics status of every
 * object as the world actually built it (active, no collision, failed with reason).
 */
export function EnvironmentStatus() {
  const mode = useRobotStateStore((s) => s.mode);
  const draft = useEnvironmentStore((s) => s.draft);
  const savedMap = useEnvironmentStore((s) => s.environments);
  const selected = useSimulationStore((s) => s.settings.environment);
  const simState = useSimulationStore((s) => s.state);
  const engine = useSimulationStore((s) => s.engine);
  useSimulationStore((s) => s.info.simTime);
  const env = mode === 'environment' ? draft : resolveEnvironment(selected);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const problems = useMemo(() => (env ? validateEnvironment(env) : []), [env, savedMap]);
  const world = activePhysicsController()?.physicsWorld;
  const built = world && !world.isDisposed ? world.environmentBodies : null;
  if (!env) return <p className="p-3 text-xs text-muted">No environment open.</p>;
  const collidable = env.objects.filter((o) => o.collision).length;
  const dynamic = env.objects.filter((o) => o.collision && o.body === 'dynamic').length;
  return (
    <div className="flex h-full gap-4 overflow-auto p-3 text-[11.5px]" data-testid="environment-status">
      <dl className="grid shrink-0 grid-cols-[auto_auto] content-start gap-x-4 gap-y-0.5">
        <dt className="text-faint">Environment</dt>
        <dd data-testid="env-status-name">{env.name}</dd>
        <dt className="text-faint">Mode</dt>
        <dd>{mode === 'environment' ? 'Edit Mode (physics off)' : engine === 'physics' ? `Test Mode · simulation ${simState}` : 'Kinematic engine (no environment physics)'}</dd>
        <dt className="text-faint">Objects</dt>
        <dd data-testid="env-status-objects">{env.objects.length}</dd>
        <dt className="text-faint">Physics bodies</dt>
        <dd data-testid="env-status-bodies">
          {collidable} collider{collidable === 1 ? '' : 's'} ({dynamic} dynamic){env.objects.some((o) => o.kind === 'ground') ? '' : ' + default floor'}
        </dd>
        <dt className="text-faint">Validation</dt>
        <dd className={problems.length ? 'text-err' : 'text-ok'} data-testid="env-status-validation">
          {problems.length ? `${problems.length} problem(s)` : 'OK'}
        </dd>
      </dl>
      <div className="min-w-0 flex-1">
        {problems.length > 0 && (
          <ul className="mb-2 space-y-0.5 text-err">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
        {built ? (
          <table className="w-full text-left text-[11px]" data-testid="env-status-built">
            <thead className="text-faint">
              <tr>
                <th className="font-normal">Object (built in the running world)</th>
                <th className="font-normal">Physics</th>
              </tr>
            </thead>
            <tbody>
              {built.map((b) => (
                <tr key={b.objectId}>
                  <td>{b.name}</td>
                  <td className={b.status === 'failed' ? 'text-err' : b.status === 'active' ? 'text-ok' : 'text-warn'}>
                    {b.status === 'active' ? (b.dynamic ? 'active (dynamic)' : 'active (static)') : b.status === 'failed' ? `failed: ${b.error}` : 'no collision'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-faint">
            {env.objects.length} objects: {Object.entries(env.objects.reduce<Record<string, number>>((acc, o) => ({ ...acc, [KIND_LABEL[o.kind]]: (acc[KIND_LABEL[o.kind]] ?? 0) + 1 }), {}))
              .map(([k, n]) => `${n} ${k.toLowerCase()}`)
              .join(', ') || 'none'}
            . Physics bodies are built from the saved environment when the simulation starts.
          </p>
        )}
      </div>
    </div>
  );
}
