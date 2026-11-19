import { DriveSetupGuide } from './DriveSetupGuide';
import { useMemo } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '../../components/common/Button';
import { useSceneStore } from '../../stores/sceneStore';
import type { DifferentialDriveController } from '../../types/actuator';
import { DEG_TO_RAD, RAD_TO_DEG } from '../../utils/math';
import { measureDriveGeometry } from '../robot-model/drive';
import { robotModel } from '../robot-model/robotModelConnector';
import { NumberField } from './NumberField';

function Dimension({
  label,
  testId,
  value,
  measured,
  onCommit,
  onAuto,
}: {
  label: string;
  testId: string;
  value: number | null;
  measured: number | null;
  onCommit: (v: number) => void;
  onAuto: () => void;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px] text-muted">
        <span>{label}</span>
        {value === null ? (
          <span className="text-[10px] text-ok">auto</span>
        ) : (
          <button type="button" onClick={onAuto} className="text-[10px] text-accent hover:underline">
            use measured
          </button>
        )}
      </div>
      <NumberField label="m" value={value ?? measured ?? 0} step={0.005} decimals={4} testId={testId} onCommit={onCommit} />
    </div>
  );
}

function DriveEditor({ controller }: { controller: DifferentialDriveController }) {
  const objects = useSceneStore((s) => s.objects);
  const joints = useSceneStore((s) => s.joints);
  const measured = useMemo(
    () => measureDriveGeometry({ ...controller, wheelRadius: null, trackWidth: null }, objects, joints),
    [controller, objects, joints],
  );
  const name = (id: string) => objects.find((o) => o.id === id)?.name ?? joints.find((j) => j.id === id)?.name ?? 'missing';
  const update = (patch: Parameters<typeof robotModel.updateController>[1]) => robotModel.updateController(controller.id, patch);

  return (
    <div className="space-y-2" data-testid="drive-settings">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
        <dt className="text-faint">Moves</dt>
        <dd className="truncate text-right">{name(controller.rootComponentId)}</dd>
        <dt className="text-faint">Left wheel</dt>
        <dd className="truncate text-right">{name(controller.leftJointId)}</dd>
        <dt className="text-faint">Right wheel</dt>
        <dd className="truncate text-right">{name(controller.rightJointId)}</dd>
      </dl>
      <div className="grid grid-cols-2 gap-1.5">
        <Dimension
          label="Wheel radius"
          testId="drive-radius"
          value={controller.wheelRadius}
          measured={measured.ok ? measured.geometry.wheelRadius : null}
          onCommit={(v) => update({ wheelRadius: v })}
          onAuto={() => update({ wheelRadius: null })}
        />
        <Dimension
          label="Track width"
          testId="drive-track"
          value={controller.trackWidth}
          measured={measured.ok ? measured.geometry.trackWidth : null}
          onCommit={(v) => update({ trackWidth: v })}
          onAuto={() => update({ trackWidth: null })}
        />
        <div>
          <div className="mb-1 flex justify-between text-[11px] text-muted">
            <span>Top speed</span>
            <span className="font-mono text-[10px] text-faint">m/s</span>
          </div>
          <NumberField label="v" value={controller.maxLinearSpeed} step={0.05} decimals={3} testId="drive-max-speed" onCommit={(v) => update({ maxLinearSpeed: v })} />
        </div>
        <div>
          <div className="mb-1 flex justify-between text-[11px] text-muted">
            <span>Top turn rate</span>
            <span className="font-mono text-[10px] text-faint">°/s</span>
          </div>
          <NumberField
            label="ω"
            value={controller.maxAngularSpeed * RAD_TO_DEG}
            step={5}
            decimals={1}
            testId="drive-max-turn"
            onCommit={(v) => update({ maxAngularSpeed: v * DEG_TO_RAD })}
          />
        </div>
      </div>
      {!measured.ok && <p className="text-[11px] text-err">{measured.errors.join(' ')}</p>}
      {measured.ok && measured.geometry.warnings.map((w) => <p key={w} className="text-[11px] text-warn">{w}</p>)}
      <Button size="sm" variant="danger" icon={<Trash2 size={12} />} onClick={() => robotModel.removeController(controller.id)}>
        Remove drive
      </Button>
    </div>
  );
}

/** Differential-drive settings in the project summary (Build Mode). */
export function ControllerSection() {
  const controller = useSceneStore((s) => s.controllers.find((c) => c.type === 'differentialDrive'));
  return (
    <section className="border-b border-line-soft px-3 py-3" data-testid="controller-section">
      <h3 className="mb-2 text-[10.5px] font-semibold tracking-wider text-muted uppercase">Drive controller</h3>
      {controller ? (
        <DriveEditor controller={controller} />
      ) : (
        <DriveSetupGuide testId="setup-drive-build" />
      )}
    </section>
  );
}
