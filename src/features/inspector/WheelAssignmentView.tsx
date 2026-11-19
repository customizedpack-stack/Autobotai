import { useMemo } from 'react';
import { useSceneStore } from '../../stores/sceneStore';
import type { DifferentialDriveController } from '../../types/actuator';
import { wheelAssignment } from '../robot-model/wheelAssignment';

/**
 * Left and right drive wheels by physical side: the joint and the part each side drives.
 * When a part's name says the other side (Explorer Bots saved in Phase 1), a warning stays
 * visible; parts are never renamed automatically.
 */
export function WheelAssignmentView({ controller, testId }: { controller: DifferentialDriveController; testId: string }) {
  const objects = useSceneStore((s) => s.objects);
  const joints = useSceneStore((s) => s.joints);
  const a = useMemo(() => wheelAssignment(controller, objects, joints), [controller, objects, joints]);
  return (
    <div data-testid={testId}>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
        {[a.left, a.right].map((s) => (
          <div key={s.side} className="contents">
            <dt className="text-faint">{s.side === 'left' ? 'Left wheel' : 'Right wheel'}</dt>
            <dd className="truncate text-right" data-testid={`${testId}-${s.side}`} data-part={s.partName} title={`Joint "${s.jointName}" drives the part "${s.partName}".`}>
              {s.partName} <span className="text-faint">· {s.jointName}</span>
            </dd>
          </div>
        ))}
      </dl>
      {a.warnings.length > 0 && (
        <ul className="mt-1.5 space-y-1 rounded-md bg-warn/10 p-2 text-[11px] text-warn" data-testid={`${testId}-warnings`}>
          {a.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
