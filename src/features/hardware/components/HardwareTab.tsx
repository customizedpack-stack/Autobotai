import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, Cable, Cpu, OctagonX, Play, Plug, PlugZap, RefreshCw, ShieldCheck, Square, Upload } from 'lucide-react';
import { Badge } from '../../../components/common/Badge';
import { Button } from '../../../components/common/Button';
import { useSceneStore } from '../../../stores/sceneStore';
import { cn } from '../../../utils/cn';
import { useBlueprintStore } from '../../blueprint/blueprintStore';
import { inputClass } from '../../blueprint/components/format';
import { Section } from '../../blueprint/components/shared';
import { useCodeStudioStore } from '../../code-studio/codeStudioStore';
import { runActiveProgram } from '../../code-studio/runActions';
import { useExecutionStore } from '../../code-studio/runtime/executionStore';
import { measureDriveGeometry } from '../../robot-model/drive';
import { sensorStream } from '../../sensors/stream/sensorStream';
import { setWorkspaceMode } from '../../controls/controlSession';
import {
  armHardware,
  calibrationTest,
  clearHardwareFault,
  connectHardware,
  currentValidation,
  deployPrepared,
  disarmHardware,
  disconnectHardware,
  emergencyStop,
  jogStart,
  jogStop,
  reconnectHardware,
  resetEmergencyStop,
  setExecutionTarget,
  stopHardware,
} from '../connectionManager';
import type { JogDirection } from '../hal/differentialDrive';
import {
  acknowledgeWarning,
  addMotorPowerSwitchToBom,
  applyFirmwarePinMap,
  prepareForHardware,
  projectPrograms,
  removeProfile,
  selectReferenceProfile,
  setCalibration,
  setLimits,
  setMotorPowerSwitchConfirmed,
  setPowerSupply,
  validateAndRecord,
} from '../hardwareActions';
import { CONNECTION_LABELS, connectionState, useHardwareStore } from '../hardwareStore';
import { physicalReadings } from '../physicalTelemetry';
import { FIRMWARE_PIN_MAP, type ValidationResult } from '../safety/validation';
import { webSerialSupport } from '../transport/webSerial';
import type { TransportKind } from '../transport/types';

const STATE_TONE = { connected: 'ok', running: 'accent', 'emergency-stopped': 'err', fault: 'err', disconnected: 'warn', stopping: 'warn' } as const;

function useNow(ms = 250): number {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    const t = setInterval(() => setNow(performance.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

function Row({ label, children, testId }: { label: string; children: ReactNode; testId?: string }) {
  return (
    <div className="contents">
      <dt className="text-muted">{label}</dt>
      <dd className="font-mono text-ink" data-testid={testId}>
        {children}
      </dd>
    </div>
  );
}

function NumberField({ label, value, onCommit, testId, step = 1, unit }: { label: string; value: number | null; onCommit: (v: number | null) => void; testId?: string; step?: number; unit?: string }) {
  return (
    <label className="flex flex-col gap-0.5 text-[11px] text-muted">
      {label}
      <span className="flex items-center gap-1">
        <input
          type="number"
          step={step}
          className={cn(inputClass, 'w-24')}
          defaultValue={value ?? ''}
          key={String(value)}
          placeholder="Unknown"
          onBlur={(e) => onCommit(e.target.value === '' ? null : Number(e.target.value))}
          data-testid={testId}
        />
        {unit && <span className="text-faint">{unit}</span>}
      </span>
    </label>
  );
}

// ── 1. Connection ──
function ConnectionSection() {
  const s = useHardwareStore();
  const state = connectionState(s);
  const now = useNow();
  const support = webSerialSupport();
  const [method, setMethod] = useState<TransportKind>(() => useHardwareStore.getState().method ?? (support.ok ? 'web-serial' : 'simulated'));
  const busy = s.phase === 'connecting' || s.phase === 'waiting-permission';
  return (
    <Section
      title="Connection"
      testId="hw-connection"
      actions={
        <span data-testid="hw-state" data-state={state}>
          <Badge tone={STATE_TONE[state as keyof typeof STATE_TONE] ?? 'neutral'}>{CONNECTION_LABELS[state]}</Badge>
        </span>
      }
    >
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-0.5 text-[11px] text-muted">
          Connection method
          <select className={inputClass} value={method} onChange={(e) => setMethod(e.target.value as TransportKind)} disabled={s.phase === 'open' || busy} data-testid="hw-method">
            <option value="web-serial" disabled={!support.ok}>
              USB serial (Web Serial) — real ESP32{support.ok ? '' : ' (not available here)'}
            </option>
            <option value="simulated">Simulated device (no hardware)</option>
          </select>
        </label>
        <Button size="sm" variant="primary" icon={<Plug size={12} />} disabled={s.phase === 'open' || busy} onClick={() => void connectHardware(method)} data-testid="hw-connect">
          Connect
        </Button>
        <Button size="sm" icon={<RefreshCw size={12} />} disabled={busy || !s.reconnectAvailable || s.method === null} onClick={() => void reconnectHardware()} data-testid="hw-reconnect">
          Reconnect
        </Button>
        <Button size="sm" icon={<PlugZap size={12} />} disabled={s.phase !== 'open' && s.phase !== 'connecting' && s.phase !== 'waiting-permission'} onClick={() => void disconnectHardware(s.phase === 'open' ? undefined : 'Connection attempt cancelled by the user.')} data-testid="hw-disconnect">
          {s.phase === 'open' ? 'Disconnect' : 'Cancel'}
        </Button>
      </div>
      {!support.ok && <p className="mt-1.5 text-[11px] text-muted" data-testid="hw-webserial-unavailable">Web Serial: {support.message}</p>}
      {s.error && (
        <p className="mt-1.5 text-[11px] text-err" data-testid="hw-error" role="alert">
          {s.error}
        </p>
      )}
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11px] sm:grid-cols-[auto_1fr_auto_1fr]">
        <Row label="Device" testId="hw-device">{s.device?.device ?? '—'}</Row>
        <Row label="Board">{s.device?.board ?? '—'}</Row>
        <Row label="Firmware" testId="hw-firmware">{s.device ? `v${s.device.firmware} (protocol ${s.device.protocol})` : '—'}</Row>
        <Row label="Link">{s.method === 'simulated' ? 'Simulated device (no hardware)' : s.transportLabel ?? '—'}</Row>
        <Row label="Last message" testId="hw-last-rx">{s.lastRxAt && s.phase === 'open' ? `${Math.max(0, Math.round(now - s.lastRxAt))} ms ago` : '—'}</Row>
        <Row label="Latency" testId="hw-latency">{s.latencyMs !== null && s.phase === 'open' ? `${s.latencyMs} ms` : '—'}</Row>
        <Row label="Heartbeat" testId="hw-heartbeat">{s.heartbeat}</Row>
        <Row label="Encoders">{s.device ? (s.device.encoders ? 'Fitted' : 'Not fitted (no encoder data)') : '—'}</Row>
      </dl>
    </Section>
  );
}

// ── 2. Profile and validation ──
function PowerSupplyForm({ initial }: { initial: { kind: 'battery' | 'bench' | 'unknown'; voltageV: number | null; maxCurrentA: number | null; source: string } }) {
  const [ps, setPs] = useState(initial);
  return (
    <>
          <p className="text-[11px] font-semibold">Motor power supply (you enter it; it is not verified by AutoBotAI)</p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-0.5 text-[11px] text-muted">
          Type
          <select className={inputClass} value={ps.kind} onChange={(e) => setPs({ ...ps, kind: e.target.value as typeof ps.kind })} data-testid="hw-power-kind">
            <option value="unknown">Unknown</option>
            <option value="battery">Battery</option>
            <option value="bench">Current-limited bench supply</option>
          </select>
        </label>
        <NumberField label="Voltage" unit="V" step={0.1} value={ps.voltageV} onCommit={(v) => setPs({ ...ps, voltageV: v })} testId="hw-power-voltage" />
        <NumberField label="Max current" unit="A" step={0.1} value={ps.maxCurrentA} onCommit={(v) => setPs({ ...ps, maxCurrentA: v })} testId="hw-power-current" />
      </div>
      <input className={cn(inputClass, 'w-full')} placeholder="Where the values come from (datasheet, supply setting)" value={ps.source} maxLength={200} onChange={(e) => setPs({ ...ps, source: e.target.value })} data-testid="hw-power-source" />
      <Button size="sm" onClick={() => setPowerSupply(ps)} data-testid="hw-power-save">
        Save power supply
      </Button>
    </>
  );
}

function ProfileSection({ validation, onValidate }: { validation: ValidationResult | null; onValidate: () => void }) {
  const profile = useBlueprintStore((s) => s.blueprint.hardwareProfile);
  if (!profile)
    return (
      <Section title="Hardware profile" testId="hw-profile">
        <p className="mb-2 text-[11px] text-muted">
          One configuration is supported: the Explorer Bot reference hardware (ESP32-DevKitC V4, TB6612FNG carrier, two Pololu 100:1 HP 6V motors, Pololu 70 mm wheels, VL53L0X carrier, a battery you specify and a motor-power switch). Other boards, drivers and motors are not assumed to work.
        </p>
        <Button size="sm" variant="primary" icon={<Cpu size={12} />} onClick={selectReferenceProfile} data-testid="hw-select-profile">
          Use the Explorer Bot reference hardware
        </Button>
      </Section>
    );
  return (
    <Section
      title="Hardware profile and validation"
      testId="hw-profile"
      actions={
        <Button size="sm" variant="ghost" onClick={removeProfile}>
          Remove profile
        </Button>
      }
    >
      <p className="mb-2 text-[11px] text-muted">Explorer Bot reference hardware (see docs/hardware/EXPLORER-BOT-REFERENCE-HARDWARE.md).</p>
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="space-y-1.5">
          <PowerSupplyForm key={JSON.stringify(profile.powerSupply)} initial={profile.powerSupply} />
          <p className="pt-1 text-[11px] font-semibold">Hardware emergency stop</p>
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <Button size="sm" onClick={addMotorPowerSwitchToBom} data-testid="hw-add-switch">
              Add motor-power switch to the BOM
            </Button>
            <label className="flex items-center gap-1 text-muted">
              <input type="checkbox" checked={profile.motorPowerSwitchConfirmed} onChange={(e) => setMotorPowerSwitchConfirmed(e.target.checked)} data-testid="hw-switch-confirm" />
              A switch between the battery + and the driver VM pin is wired and within reach
            </label>
          </div>
        </div>
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold">Motion limits (enforced by the browser and again by the firmware)</p>
          <div className="flex flex-wrap gap-2">
            <NumberField label="Max speed" unit="% duty" value={profile.limits.maxSpeedPermille / 10} onCommit={(v) => v !== null && setLimits({ maxSpeedPermille: v * 10 })} testId="hw-limit-speed" />
            <NumberField label="Acceleration" unit="‰/s" value={profile.limits.accelPermillePerS} onCommit={(v) => v !== null && setLimits({ accelPermillePerS: v })} testId="hw-limit-accel" />
            <NumberField label="Max run time" unit="s" value={profile.limits.maxRunSeconds} onCommit={(v) => v !== null && setLimits({ maxRunSeconds: v })} testId="hw-limit-run" />
          </div>
          <p className="text-[11px] text-faint">Every motion command also expires after 300 ms unless renewed, and the firmware stops after 1 s without contact.</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="primary" icon={<ShieldCheck size={12} />} onClick={onValidate} data-testid="hw-validate">
          Validate hardware
        </Button>
        {validation && (
          <span className={cn('text-[11px]', validation.profileReady ? 'text-ok' : 'text-warn')} data-testid="hw-validation-summary" data-ready={validation.profileReady} data-can-arm={validation.canArm}>
            {validation.profileReady ? 'Design and profile ready.' : `${validation.blockers} blocker(s), ${validation.openWarnings} warning(s) to review.`} {validation.deviceReady ? 'Device ready.' : 'No supported device ready.'}
          </span>
        )}
      </div>
      {validation && (
        <ul className="mt-2 space-y-1" data-testid="hw-validation">
          {validation.items
            .filter((i) => i.level !== 'ok')
            .map((i) => (
              <li key={i.id} className="flex gap-2 text-[11.5px]" data-testid={`hw-item-${i.id}`} data-level={i.level}>
                <Badge tone={i.level === 'blocker' ? 'err' : i.level === 'warning' ? 'warn' : 'neutral'}>{i.level === 'blocker' ? 'Blocks arming' : i.level}</Badge>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{i.title}</p>
                  <p className="text-[11px] text-muted">{i.reason}</p>
                  {i.ackId && (
                    <label className="mt-0.5 flex items-center gap-1 text-[11px] text-muted">
                      <input type="checkbox" checked={Boolean(i.acknowledged)} onChange={(e) => acknowledgeWarning(i.ackId!, e.target.checked)} data-testid={`hw-ack-${i.id}`} />
                      I reviewed this warning and accept it
                    </label>
                  )}
                  {i.fix === 'apply-pin-map' && (
                    <Button size="sm" className="mt-0.5" onClick={applyFirmwarePinMap} data-testid="hw-fix-pins">
                      Set the driver and sensor wires to the firmware pin map
                    </Button>
                  )}
                  {i.fix === 'add-switch' && (
                    <Button size="sm" className="mt-0.5" onClick={addMotorPowerSwitchToBom}>
                      Add the switch to the BOM
                    </Button>
                  )}
                </div>
              </li>
            ))}
        </ul>
      )}
      <details className="mt-2 text-[11px] text-muted">
        <summary className="cursor-pointer">Firmware pin map</summary>
        <p className="mt-1">Motor driver: {Object.entries(FIRMWARE_PIN_MAP.driver).map(([k, v]) => `${k} → ${v}`).join(', ')}. Motor A (AO1/AO2) = left motor, motor B (BO1/BO2) = right motor.</p>
        <p>VL53L0X: {Object.entries(FIRMWARE_PIN_MAP.distance).map(([k, v]) => `${k} → ${v}`).join(', ')}. Optional stop button: GPIO18 to GND.</p>
      </details>
    </Section>
  );
}

// ── 3. Arming, deployment and manual control ──
function ControlSection({ validation }: { validation: ValidationResult | null }) {
  const s = useHardwareStore();
  const execState = useExecutionStore((x) => x.state);
  const [safe, setSafe] = useState(false);
  const [startConfirm, setStartConfirm] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'err'; text: string[] } | null>(null);
  const programs = projectPrograms();
  const [programId, setProgramId] = useState(programs[0]?.id ?? '');
  const open = s.phase === 'open';
  const armed = s.deviceState === 'armed';
  const say = (tone: 'ok' | 'err', ...text: string[]) => setMessage({ tone, text });
  const jogButton = (dir: JogDirection, label: string) => (
    <Button
      size="sm"
      disabled={!armed || (s.activity !== 'idle' && s.activity !== 'jog')}
      onPointerDown={() => jogStart(dir)}
      onPointerUp={jogStop}
      onPointerLeave={jogStop}
      onKeyDown={(e) => e.key === ' ' && jogStart(dir)}
      onKeyUp={jogStop}
      data-testid={`hw-jog-${dir}`}
    >
      {label}
    </Button>
  );
  return (
    <Section title="Arming, program deployment and low-speed control" testId="hw-control">
      <label className="flex items-start gap-1.5 text-[11.5px]">
        <input type="checkbox" className="mt-0.5" checked={safe} onChange={(e) => setSafe(e.target.checked)} data-testid="hw-confirm-safe" />
        <span>The robot is safely positioned (wheels off the ground for the first tests, or a clear floor area), nobody's hands are near the wheels, and I can reach the motor-power switch.</span>
      </label>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="primary"
          disabled={!open || armed || !validation?.canArm}
          title={!validation?.canArm ? 'Validate the hardware first; every blocker must be resolved and every warning accepted.' : undefined}
          onClick={async () => {
            const r = await armHardware(safe);
            if (r.ok) say('ok', 'Armed. The motors can now move. Motion only starts when you jog or start a program.');
            else say('err', ...r.reasons);
          }}
          data-testid="hw-arm"
        >
          Arm motors
        </Button>
        <Button size="sm" disabled={!armed} onClick={() => void disarmHardware()} data-testid="hw-disarm">
          Disarm
        </Button>
        <Button size="sm" icon={<Square size={11} />} disabled={!open} onClick={() => void stopHardware()} data-testid="hw-stop">
          Stop
        </Button>
        <Button size="sm" disabled={s.deviceState !== 'estop'} onClick={() => void resetEmergencyStop()} data-testid="hw-reset-estop">
          Reset emergency stop
        </Button>
        <Button size="sm" disabled={s.deviceState !== 'fault'} onClick={() => void clearHardwareFault()} data-testid="hw-clear-fault">
          Clear fault
        </Button>
      </div>
      {message && (
        <ul className={cn('mt-1.5 text-[11px]', message.tone === 'ok' ? 'text-ok' : 'text-err')} data-testid="hw-message">
          {message.text.map((t, n) => (
            <li key={n}>{t}</li>
          ))}
        </ul>
      )}

      <p className="mt-3 text-[11px] font-semibold">Program</p>
      <p className="text-[11px] text-muted">
        Programs run in this browser's code sandbox; only limited, expiring motion commands are sent to the robot. Nothing is flashed to the ESP32, and JavaScript does not run on it.
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <select className={inputClass} value={programId} onChange={(e) => setProgramId(e.target.value)} data-testid="hw-program">
          {programs.length === 0 && <option value="">No programs in this project</option>}
          {programs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.language === 'blockly' ? 'Blockly' : 'JavaScript'})
            </option>
          ))}
        </select>
        <Button
          size="sm"
          disabled={!programId}
          onClick={async () => {
            const r = await prepareForHardware(programId);
            if ('error' in r) say('err', r.error);
            else if (r.ok) say('ok', `Prepared "${r.name}" (${r.hash}).`, ...r.issues.map((i) => `Note: ${i.message}`));
            else say('err', ...r.issues.filter((i) => i.severity === 'error').map((i) => (i.line ? `Line ${i.line}: ${i.message}` : i.message)));
          }}
          data-testid="hw-prepare"
        >
          Build / prepare
        </Button>
        <Button
          size="sm"
          icon={<Upload size={11} />}
          disabled={!open || !s.prepared?.ok || armed}
          onClick={async () => {
            const r = await deployPrepared();
            say(r.ok ? 'ok' : 'err', r.message);
          }}
          data-testid="hw-deploy"
        >
          Deploy
        </Button>
        <span className="text-[11px] text-muted" data-testid="hw-deployed">
          {s.deployed ? `Deployed: ${s.deployed.name} (${s.deployed.hash})` : 'Nothing deployed'}
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1 text-[11px] text-muted">
          <input type="checkbox" checked={startConfirm} onChange={(e) => setStartConfirm(e.target.checked)} data-testid="hw-confirm-start" />
          Run the deployed program on the {s.method === 'simulated' ? 'simulated device' : 'physical robot'}
        </label>
        <Button
          size="sm"
          variant="danger"
          icon={<Play size={11} />}
          disabled={!armed || !s.deployed || !startConfirm || s.activity !== 'idle'}
          onClick={async () => {
            if (!s.deployed) return;
            if (!setExecutionTarget('physical', startConfirm)) return say('err', 'The physical target could not be selected.');
            useCodeStudioStore.getState().setActive(s.deployed.programId);
            setWorkspaceMode('code');
            setStartConfirm(false);
            const ok = await runActiveProgram();
            if (!ok) {
              setExecutionTarget('simulation', true);
              say('err', 'The program did not start. See the Program console for the reason.');
            }
          }}
          data-testid="hw-start"
        >
          Start
        </Button>
        <span className="text-[11px] text-muted">Program: {s.activity === 'program' ? `running (${execState})` : 'not running'}</span>
      </div>

      <p className="mt-3 text-[11px] font-semibold">Low-speed manual control (hold the button; 25 % of the speed limit)</p>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {jogButton('forward', 'Forward')}
        {jogButton('backward', 'Reverse')}
        {jogButton('left', 'Turn left')}
        {jogButton('right', 'Turn right')}
      </div>
    </Section>
  );
}

// ── 4. Calibration ──
function CalibrationSection() {
  const profile = useBlueprintStore((s) => s.blueprint.hardwareProfile);
  const s = useHardwareStore();
  const objects = useSceneStore((x) => x.objects);
  const joints = useSceneStore((x) => x.joints);
  const controllers = useSceneStore((x) => x.controllers);
  const [knownMm, setKnownMm] = useState<number | null>(null);
  const [asked, setAsked] = useState<'left' | 'right' | null>(null);
  const virtual = useMemo(() => {
    const c = controllers[0];
    if (!c) return null;
    const g = measureDriveGeometry(c, objects, joints);
    return g.ok ? { wheelDiameterMm: Math.round(g.geometry.wheelRadius * 2000), trackWidthMm: Math.round(g.geometry.trackWidth * 1000) } : null;
  }, [controllers, objects, joints]);
  if (!profile) return null;
  const c = profile.calibration;
  const armed = s.deviceState === 'armed';
  const diff = (v: number | null | undefined, p: number | null) => (v == null || p === null ? 'not measured' : `${p - v > 0 ? '+' : ''}${(p - v).toFixed(1)} mm`);
  return (
    <Section title="Calibration (measured physical values; the 3D model is never changed)" testId="hw-calibration">
      <p className="mb-2 text-[11px] text-muted">Motor tests run one wheel at 25 % of the speed limit for one second. Arm first and lift the wheels off the ground.</p>
      <div className="flex flex-wrap items-center gap-2">
        {(['left', 'right'] as const).map((side) => (
          <Button
            key={side}
            size="sm"
            disabled={!armed || s.activity !== 'idle'}
            onClick={async () => {
              if (await calibrationTest(side === 'left' ? 'left-wheel' : 'right-wheel', 1000)) setAsked(side);
            }}
            data-testid={`hw-cal-${side}`}
          >
            Test {side} motor
          </Button>
        ))}
        <span className="text-[11px] text-muted" data-testid="hw-cal-directions">
          Left motor: {c.invertLeft ? 'inverted' : 'normal'} · Right motor: {c.invertRight ? 'inverted' : 'normal'}
        </span>
      </div>
      {asked && (
        <div className="mt-1.5 flex flex-wrap items-center gap-2 rounded border border-accent/30 bg-accent-soft p-2 text-[11.5px]" data-testid="hw-cal-question">
          <span>Which way did the {asked} wheel turn?</span>
          <Button
            size="sm"
            onClick={() => {
              setAsked(null);
            }}
            data-testid="hw-cal-forward"
          >
            Forward (correct)
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setCalibration(asked === 'left' ? { invertLeft: !c.invertLeft } : { invertRight: !c.invertRight }, `${asked} motor direction`);
              setAsked(null);
            }}
            data-testid="hw-cal-backward"
          >
            Backward (invert it)
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setAsked(null);
            }}
          >
            It did not turn
          </Button>
          <span className="text-[11px] text-muted">If it did not turn, check the wiring and raise the start-up duty below.</span>
        </div>
      )}
      <p className="mt-1 text-[11px] text-faint">A changed direction is sent to the device the next time it is armed.</p>
      <div className="mt-2 flex flex-wrap gap-3">
        <NumberField label="Start-up duty (PWM minimum)" unit="‰" value={c.pwmMinPermille} onCommit={(v) => v !== null && setCalibration({ pwmMinPermille: v }, 'PWM minimum')} testId="hw-cal-pwm" />
        <NumberField label="Wheel diameter (measured)" unit="mm" step={0.1} value={c.wheelDiameterMm} onCommit={(v) => setCalibration({ wheelDiameterMm: v }, 'wheel diameter')} testId="hw-cal-wheel" />
        <NumberField label="Track width (measured)" unit="mm" step={0.5} value={c.trackWidthMm} onCommit={(v) => setCalibration({ trackWidthMm: v }, 'track width')} testId="hw-cal-track" />
        <NumberField label="Encoder ticks / rev" value={c.encoderTicksPerRev} onCommit={(v) => setCalibration({ encoderTicksPerRev: v }, 'encoder ticks')} testId="hw-cal-encoder" />
      </div>
      <p className="mt-1 text-[11px] text-faint">The reference motors have no encoders; leave the ticks empty. Encoder data is never invented.</p>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <NumberField label="Known distance to a flat target" unit="mm" value={knownMm} onCommit={setKnownMm} testId="hw-cal-known" />
        <Button
          size="sm"
          disabled={knownMm === null || s.telemetry?.distanceStatus !== 'ok' || s.telemetry.distanceMm === null}
          onClick={() => s.telemetry?.distanceMm != null && knownMm !== null && setCalibration({ distanceOffsetMm: Math.round(knownMm - s.telemetry.distanceMm) }, 'distance offset')}
          data-testid="hw-cal-offset"
        >
          Set offset from the current reading
        </Button>
        <span className="text-[11px] text-muted" data-testid="hw-cal-offset-value">
          Offset: {c.distanceOffsetMm} mm
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        {(['x', 'y', 'z'] as const).map((axis, i) => (
          <NumberField
            key={axis}
            label={`Sensor ${axis} (${axis === 'x' ? 'forward' : axis === 'y' ? 'up' : 'left'})`}
            unit="mm"
            value={c.sensorPositionMm?.[i] ?? null}
            onCommit={(v) => {
              const pos: [number, number, number] = [...(c.sensorPositionMm ?? [0, 0, 0])] as [number, number, number];
              if (v !== null) pos[i] = v;
              setCalibration({ sensorPositionMm: pos }, 'sensor position');
            }}
          />
        ))}
        <label className="flex flex-col gap-0.5 text-[11px] text-muted">
          Robot front
          <select className={inputClass} value={c.forward} onChange={(e) => setCalibration({ forward: e.target.value as 'x+' | 'x-' }, 'robot orientation')}>
            <option value="x+">Same as the 3D model (+X)</option>
            <option value="x-">Opposite (−X)</option>
          </select>
        </label>
      </div>
      <table className="mt-3 w-full max-w-lg text-[11.5px]" data-testid="hw-cal-compare">
        <thead className="text-left text-muted">
          <tr>
            <th className="font-medium">Value</th>
            <th className="font-medium">3D model (virtual)</th>
            <th className="font-medium">Measured (physical)</th>
            <th className="font-medium">Difference</th>
          </tr>
        </thead>
        <tbody className="font-mono">
          <tr>
            <td className="font-sans text-muted">Wheel diameter</td>
            <td>{virtual ? `${virtual.wheelDiameterMm} mm` : 'unknown'}</td>
            <td>{c.wheelDiameterMm !== null ? `${c.wheelDiameterMm} mm` : 'not measured'}</td>
            <td>{diff(virtual?.wheelDiameterMm, c.wheelDiameterMm)}</td>
          </tr>
          <tr>
            <td className="font-sans text-muted">Track width</td>
            <td>{virtual ? `${virtual.trackWidthMm} mm` : 'unknown'}</td>
            <td>{c.trackWidthMm !== null ? `${c.trackWidthMm} mm` : 'not measured'}</td>
            <td>{diff(virtual?.trackWidthMm, c.trackWidthMm)}</td>
          </tr>
        </tbody>
      </table>
    </Section>
  );
}

// ── 5. Live Hardware Monitor ──
function MonitorSection() {
  const s = useHardwareStore();
  const now = useNow(200);
  const sensors = useSceneStore((x) => x.sensors);
  const sensorId = sensors.find((x) => x.type === 'distance')?.id ?? 'distance';
  const physical = physicalReadings.latest(sensorId);
  const simulated = sensorStream.latest(sensorId);
  const simDistance = simulated && simulated.type === 'distance' ? (simulated.valid ? (simulated.distance === null ? 'no hit' : `${simulated.distance.toFixed(3)} m`) : 'not valid') : 'no reading';
  const t = s.telemetry;
  void now;
  return (
    <Section title="Live Hardware Monitor" testId="hw-monitor" actions={<Badge tone={s.method === 'simulated' ? 'warn' : 'accent'}>{s.method === 'simulated' ? 'Simulated device values' : 'Physical values'}</Badge>}>
      <div className="grid gap-3 lg:grid-cols-2">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11.5px]">
          <Row label="Safety state" testId="hw-mon-state">{s.deviceState ?? '—'}</Row>
          <Row label="Motors enabled" testId="hw-mon-enabled">{t ? (t.enabled ? 'yes' : 'no (standby)') : '—'}</Row>
          <Row label="Left command / output" testId="hw-mon-left">{t ? `${t.targetLeft} / ${t.left} ‰` : '—'}</Row>
          <Row label="Right command / output" testId="hw-mon-right">{t ? `${t.targetRight} / ${t.right} ‰` : '—'}</Row>
          <Row label="Encoders">{s.device && !s.device.encoders ? 'not fitted' : '—'}</Row>
          <Row label="Heartbeat / latency">{s.phase === 'open' ? `${s.heartbeat} / ${s.latencyMs ?? '—'} ms` : '—'}</Row>
          <Row label="Last fault" testId="hw-mon-fault">{s.lastFault ? `${s.lastFault.code} (${new Date(s.lastFault.at).toLocaleTimeString()})` : 'none'}</Row>
          <Row label="Invalid messages">{s.invalidLines}</Row>
        </dl>
        <table className="h-fit w-full text-[11.5px]" data-testid="hw-compare">
          <thead className="text-left text-muted">
            <tr>
              <th className="font-medium">Distance</th>
              <th className="font-medium">{s.method === 'simulated' ? 'Simulated device' : 'Physical'}</th>
              <th className="font-medium">Simulator (3D)</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            <tr>
              <td className="font-sans text-muted">{sensorId}</td>
              <td data-testid="hw-tel-distance" data-status={physical?.status ?? 'none'}>
                {physical ? (physical.valid ? `${physical.value?.toFixed(3)} m` : physical.status) : '—'}
              </td>
              <td data-testid="hw-sim-distance">{simDistance}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <details className="mt-2 text-[11px]">
        <summary className="cursor-pointer text-muted">Message log ({s.log.length})</summary>
        <ol className="mt-1 max-h-40 overflow-auto font-mono text-[10.5px]" data-testid="hw-log">
          {s.log.slice(-40).map((e, i) => (
            <li key={i} className={e.dir === 'error' ? 'text-err' : e.dir === 'tx' ? 'text-accent' : 'text-muted'}>
              {e.dir === 'tx' ? '→' : e.dir === 'rx' ? '←' : '•'} {e.text}
            </li>
          ))}
        </ol>
      </details>
    </Section>
  );
}

export function HardwareTab() {
  const method = useHardwareStore((s) => s.method);
  const phase = useHardwareStore((s) => s.phase);
  // Subscriptions so the validation below is recomputed when the blueprint or the device state changes.
  useHardwareStore((s) => s.deviceState);
  useBlueprintStore((s) => s.blueprint);
  const [validatedOnce, setValidatedOnce] = useState(false);
  // Re-checked whenever the blueprint or the device changes, once the user has validated.
  const validation = validatedOnce ? currentValidation() : null;
  return (
    <div className="space-y-3" data-testid="hw-tab">
      {method === 'simulated' && phase !== 'idle' && (
        <p className="flex items-center gap-1.5 rounded border border-warn/40 bg-warn/10 p-2 text-[11.5px] text-warn" data-testid="hw-sim-banner">
          <AlertTriangle size={13} /> SIMULATED DEVICE — no physical hardware is connected. It runs the firmware logic in this page; results here are not hardware tests.
        </p>
      )}
      <p className="flex items-start gap-1.5 text-[11px] text-muted">
        <Cable size={13} className="mt-0.5 shrink-0" /> Connect a supported ESP32 Explorer Bot over USB. Motors stay disabled until you validate, confirm the robot is safe and arm. The browser stop buttons are not a safety device: keep the robot's motor-power switch within reach.
      </p>
      <ConnectionSection />
      <ProfileSection validation={validation} onValidate={() => {
        validateAndRecord();
        setValidatedOnce(true);
      }} />
      <ControlSection validation={validation} />
      <CalibrationSection />
      <MonitorSection />
      <div className="flex justify-end">
        <Button variant="danger" icon={<OctagonX size={13} />} onClick={() => void emergencyStop()} disabled={phase !== 'open'}>
          Emergency stop
        </Button>
      </div>
    </div>
  );
}
