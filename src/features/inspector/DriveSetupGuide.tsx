import { useMemo, useState } from 'react';
import { CheckCircle2, CircleAlert, Wrench } from 'lucide-react';
import { Button } from '../../components/common/Button';
import { useSceneStore } from '../../stores/sceneStore';
import { diagnoseDrive } from '../robot-model/driveRepair';
import { robotModel } from '../robot-model/robotModelConnector';

/**
 * Guided differential-drive setup: shows what the drive needs, part by part, and what the
 * setup will do. For a robot saved before joints existed (Phase 1) it says that the setup
 * will also attach the parts and add the two wheel joints. Errors from the setup are shown
 * here, not only in the console. Used in Control Mode and in the Build Mode inspector.
 */
export function DriveSetupGuide({ testId }: { testId: string }) {
  const objects = useSceneStore((s) => s.objects);
  const joints = useSceneStore((s) => s.joints);
  const actuators = useSceneStore((s) => s.actuators);
  const controllers = useSceneStore((s) => s.controllers);
  const diagnosis = useMemo(() => diagnoseDrive({ objects, joints, actuators, controllers }), [objects, joints, actuators, controllers]);
  const [errors, setErrors] = useState<string[]>([]);

  return (
    <div data-testid={`${testId}-guide`} data-ready={diagnosis.ready} data-repairable={diagnosis.repairable}>
      <p className="text-xs text-muted">This robot has no drive controller yet. A differential drive needs:</p>
      <ul className="mt-1.5 space-y-0.5 text-[11px]" data-testid={`${testId}-checks`}>
        {diagnosis.checks.map((c) => (
          <li key={c.id} className="flex items-start gap-1.5" data-testid={`${testId}-check-${c.id}`} data-ok={c.ok}>
            {c.ok ? <CheckCircle2 size={12} className="mt-0.5 shrink-0 text-ok" /> : <CircleAlert size={12} className="mt-0.5 shrink-0 text-warn" />}
            <span>
              <span className={c.ok ? 'text-ink' : 'text-warn'}>{c.label}</span>
              <span className="block text-[10.5px] text-faint">{c.detail}</span>
            </span>
          </li>
        ))}
      </ul>
      {!diagnosis.ready && diagnosis.repairable && (
        <p className="mt-2 rounded-md bg-accent/10 p-2 text-[11px] text-ink" data-testid={`${testId}-repair-note`}>
          This robot was saved before joints existed. The setup will attach its parts to the chassis (positions unchanged), add the two revolute wheel joints, then add the motors and the drive. It is one step you can undo.
        </p>
      )}
      {!diagnosis.ready && !diagnosis.repairable && diagnosis.errors.length > 0 && (
        <ul className="mt-2 space-y-1 rounded-md bg-err/10 p-2 text-[11px] text-err" data-testid={`${testId}-problems`}>
          {diagnosis.errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <Button
        size="sm"
        className="mt-2"
        icon={<Wrench size={13} />}
        onClick={() => {
          const result = robotModel.setUpDifferentialDrive();
          setErrors(result.ok ? [] : result.errors);
        }}
        data-testid={testId}
      >
        Set up differential drive
      </Button>
      {errors.length > 0 && (
        <p className="mt-1.5 text-[11px] text-err" role="alert" data-testid={`${testId}-error`}>
          {errors.join(' ')}
        </p>
      )}
    </div>
  );
}
