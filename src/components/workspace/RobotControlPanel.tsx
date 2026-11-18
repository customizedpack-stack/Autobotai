import { useMemo, type PointerEvent, type ReactNode } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Gauge, MapPinned, OctagonX, RotateCcw, Wrench } from 'lucide-react';
import { checkDriveReady } from '../../features/controls/commands';
import { commandContext } from '../../features/controls/commandBus';
import { applyPoseToDesign } from '../../features/controls/controlSession';
import { robotControl } from '../../features/controls/robotControlApi';
import { actuatorTypeInfo } from '../../features/robot-model/actuators';
import { robotModel } from '../../features/robot-model/robotModelConnector';
import { transformToMatrix } from '../../features/robot-model/transforms';
import { useRobotStateStore } from '../../stores/robotStateStore';
import { useSceneStore } from '../../stores/sceneStore';
import { cn } from '../../utils/cn';
import { RAD_TO_DEG } from '../../utils/math';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';
import { JointPreview } from './JointPreview';

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

type Hold = { start: () => void; end: () => void };

/** Press-and-hold button: moves while held, releases on pointer up / leave / cancel. */
function HoldButton({ label, testId, hold, children, className }: { label: string; testId: string; hold: Hold; children: ReactNode; className?: string }) {
  const down = (e: PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    hold.start();
  };
  return (
    <button
      type="button"
      aria-label={label}
      title={`${label} (hold)`}
      data-testid={testId}
      onPointerDown={down}
      onPointerUp={hold.end}
      onPointerCancel={hold.end}
      onLostPointerCapture={hold.end}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) {
          e.preventDefault();
          hold.start();
        }
      }}
      onKeyUp={(e) => {
        if (e.key === 'Enter' || e.key === ' ') hold.end();
      }}
      className={cn(
        'flex h-11 items-center justify-center rounded-md border border-line bg-raised text-ink transition-colors select-none hover:border-accent active:bg-accent-soft',
        className,
      )}
    >
      {children}
    </button>
  );
}

const PRESETS = [
  { label: 'Slow', value: 25 },
  { label: 'Normal', value: 50 },
  { label: 'Fast', value: 75 },
  { label: 'Max', value: 100 },
];

const STATUS_TONE = { idle: 'neutral', moving: 'ok', stopped: 'warn', limited: 'warn' } as const;

/**
 * variant 'control': the full panel (Control Mode).
 * variant 'code': Code Studio — programs drive the robot, so the manual drive pad,
 * keyboard hint and joint preview are hidden; status, speed, telemetry and motors stay.
 */
export function RobotControlPanel({ variant = 'control' }: { variant?: 'control' | 'code' }) {
  const code = variant === 'code';
  const projectName = useSceneStore((s) => s.projectName);
  const objects = useSceneStore((s) => s.objects);
  const joints = useSceneStore((s) => s.joints);
  const actuators = useSceneStore((s) => s.actuators);
  const controllers = useSceneStore((s) => s.controllers);
  const movement = useRobotStateStore((s) => s.movement);
  const speed = useRobotStateStore((s) => s.speedPercent);
  const setSpeed = useRobotStateStore((s) => s.setSpeedPercent);
  const rootPoses = useRobotStateStore((s) => s.rootPoses);
  const runtime = useRobotStateStore((s) => s.actuators);

  const controller = controllers.find((c) => c.type === 'differentialDrive');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const readiness = useMemo(() => checkDriveReady(commandContext()), [objects, joints, actuators, controllers]);
  const root = controller ? objects.find((o) => o.id === controller.rootComponentId) : undefined;
  const pose = controller ? rootPoses[controller.rootComponentId] ?? root?.transform : undefined;
  const heading = useMemo(() => {
    if (!pose) return 0;
    const m = transformToMatrix(pose);
    return Math.atan2(-m[2]!, m[0]!) * RAD_TO_DEG;
  }, [pose]);

  const forward: Hold = { start: () => robotControl.drive.set(1, 'panel'), end: () => robotControl.drive.set(0, 'panel') };
  const backward: Hold = { start: () => robotControl.drive.set(-1, 'panel'), end: () => robotControl.drive.set(0, 'panel') };
  const left: Hold = { start: () => robotControl.turn.set(1, 'panel'), end: () => robotControl.turn.set(0, 'panel') };
  const right: Hold = { start: () => robotControl.turn.set(-1, 'panel'), end: () => robotControl.turn.set(0, 'panel') };

  return (
    <div data-testid="robot-control-panel" data-variant={variant}>
      <Section title="Robot">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[13px] font-semibold" data-testid="control-robot-name">
            {projectName}
          </span>
          <Badge tone={STATUS_TONE[movement.status]}>
            <span data-testid="movement-status">{movement.status}</span>
          </Badge>
        </div>
        <p className="mt-1.5 text-[10.5px] leading-relaxed text-faint">Kinematic Simulation — Physics Engine Integration Coming in Phase 5</p>
      </Section>

      {!controller ? (
        <Section title="Drive setup">
          <p className="text-xs text-muted">This robot has no drive controller yet. Two wheels with revolute joints and two motor parts are needed.</p>
          <Button size="sm" className="mt-2" icon={<Wrench size={13} />} onClick={() => robotModel.setUpDifferentialDrive()} data-testid="setup-drive">
            Set up differential drive
          </Button>
        </Section>
      ) : (
        <Section title="Drive">
          {readiness.length > 0 && (
            <ul className="mb-2 space-y-1 rounded-md bg-err/10 p-2 text-[11px] text-err" data-testid="drive-problems">
              {readiness.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
          {code ? (
            <p className="text-[11px] text-muted" data-testid="code-drive-note">
              {readiness.length === 0 ? 'Drive ready. ' : ''}Your program drives the robot. Use Stop and Reset in the Code Studio toolbar.
            </p>
          ) : (
          <>
          <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Drive controls">
            <span />
            <HoldButton label="Forward" testId="btn-forward" hold={forward}>
              <ArrowUp size={18} />
            </HoldButton>
            <span />
            <HoldButton label="Turn left" testId="btn-left" hold={left}>
              <ArrowLeft size={18} />
            </HoldButton>
            <button
              type="button"
              onClick={() => robotControl.stop('panel')}
              aria-label="Stop"
              title="Stop (Space)"
              data-testid="btn-stop"
              className="flex h-11 items-center justify-center rounded-md border border-err/50 bg-err/15 text-err hover:bg-err/25"
            >
              <OctagonX size={18} />
            </button>
            <HoldButton label="Turn right" testId="btn-right" hold={right}>
              <ArrowRight size={18} />
            </HoldButton>
            <span />
            <HoldButton label="Backward" testId="btn-backward" hold={backward}>
              <ArrowDown size={18} />
            </HoldButton>
            <span />
          </div>
          <div className="mt-2 flex gap-1.5">
            <Button size="sm" className="flex-1" icon={<RotateCcw size={13} />} onClick={() => robotControl.reset('panel')} data-testid="btn-reset" title="Reset to the design pose (R)">
              Reset
            </Button>
            <Button
              size="sm"
              className="flex-1"
              icon={<MapPinned size={13} />}
              onClick={applyPoseToDesign}
              disabled={Object.keys(rootPoses).length === 0}
              data-testid="btn-apply-pose"
              title="Save the driven position into the design (undoable)"
            >
              Apply pose
            </Button>
          </div>
          <p className="mt-2 text-[10.5px] text-faint">Keys: W/↑ forward · S/↓ back · A/← left · D/→ right · Space stop · R reset</p>
          </>
          )}
        </Section>
      )}

      <Section title="Speed" action={<span className="font-mono text-[11px] text-ink" data-testid="speed-value">{speed}%</span>}>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={speed}
          onChange={(e) => setSpeed(Number(e.target.value))}
          aria-label="Speed"
          data-testid="speed-slider"
          className="w-full accent-[#3B82F6]"
        />
        <div className="mt-1.5 grid grid-cols-4 gap-1">
          {PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => setSpeed(p.value)}
              aria-pressed={speed === p.value}
              data-testid={`speed-${p.value}`}
              className={cn('h-7 rounded-md border text-[11px]', speed === p.value ? 'border-accent bg-accent-soft text-ink' : 'border-line text-muted hover:text-ink')}
            >
              {p.label}
              <span className="block text-[9.5px] text-faint">{p.value}%</span>
            </button>
          ))}
        </div>
        {controller && (
          <p className="mt-2 text-[10.5px] text-faint">
            100% = {controller.maxLinearSpeed.toFixed(2)} m/s, {(controller.maxAngularSpeed * RAD_TO_DEG).toFixed(0)}°/s
          </p>
        )}
      </Section>

      <Section title="Telemetry" action={<Gauge size={12} className="text-faint" />}>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[11px]" data-testid="telemetry">
          <dt className="text-faint">Speed</dt>
          <dd className="text-right" data-testid="telemetry-speed">{movement.twist.linear.toFixed(3)} m/s</dd>
          <dt className="text-faint">Turn rate</dt>
          <dd className="text-right" data-testid="telemetry-turn">{(movement.twist.angular * RAD_TO_DEG).toFixed(1)} °/s</dd>
          <dt className="text-faint">Wheels L / R</dt>
          <dd className="text-right" data-testid="telemetry-wheels">
            {(movement.wheels?.left ?? 0).toFixed(2)} / {(movement.wheels?.right ?? 0).toFixed(2)} rad/s
          </dd>
          <dt className="text-faint">Position X, Z</dt>
          <dd className="text-right" data-testid="telemetry-position">
            {pose ? `${pose.position[0].toFixed(3)}, ${pose.position[2].toFixed(3)}` : '—'}
          </dd>
          <dt className="text-faint">Heading</dt>
          <dd className="text-right" data-testid="telemetry-heading">{heading.toFixed(1)}°</dd>
          <dt className="text-faint">Distance</dt>
          <dd className="text-right" data-testid="telemetry-distance">{movement.distance.toFixed(3)} m</dd>
        </dl>
        {movement.lastError && (
          <p className="mt-2 rounded-md bg-err/10 p-2 text-[11px] text-err" data-testid="command-error">
            {movement.lastError}
          </p>
        )}
      </Section>

      <Section title={`Actuators (${actuators.length})`}>
        {actuators.length === 0 ? (
          <p className="text-xs text-muted">No actuators. Add one to a joint in Build Mode.</p>
        ) : (
          <ul className="space-y-1.5" data-testid="actuator-status">
            {actuators.map((a) => {
              const live = runtime[a.id];
              const state = !a.enabled ? 'disabled' : (live?.state ?? 'idle');
              return (
                <li key={a.id} className="flex items-center gap-2 rounded-md border border-line-soft px-2 py-1.5 text-[11px]">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-ink">{a.name}</span>
                    <span className="block truncate text-faint">
                      {actuatorTypeInfo(a.type).label} · {joints.find((j) => j.id === a.jointId)?.name}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className={cn('block font-mono', state === 'active' ? 'text-ok' : state === 'disabled' ? 'text-faint' : 'text-muted')}>{state}</span>
                    <span className="block font-mono text-faint">{(live?.target ?? 0).toFixed(2)}</span>
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={a.enabled}
                    aria-label={`${a.enabled ? 'Disable' : 'Enable'} ${a.name}`}
                    onClick={() => robotModel.updateActuator(a.id, { enabled: !a.enabled })}
                    className={cn('relative h-4 w-7 shrink-0 rounded-full transition-colors', a.enabled ? 'bg-accent' : 'bg-line')}
                  >
                    <span className={cn('absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all', a.enabled ? 'left-3.5' : 'left-0.5')} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {!code && (
        <Section title="Joint preview">
        <JointPreview />
      </Section>
      )}
    </div>
  );
}
