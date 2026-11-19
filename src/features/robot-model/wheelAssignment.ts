import type { DifferentialDriveController } from '../../types/actuator';
import type { RobotJoint } from '../../types/joint';
import type { SceneObject } from '../../types/scene';
import { measureDriveGeometry } from './drive';

/**
 * Which part the drive moves as its left and right wheel. The sides come from the drive
 * controller, which the setup assigns by PHYSICAL position (left is −Z when the robot faces
 * +X), never from part names. Robots saved in Phase 1 named the +Z wheel "Left Wheel"; their
 * parts keep those names (nothing is renamed), so a part whose name says the other side gets a
 * warning that stays visible as long as the names disagree.
 */
export interface WheelSide {
  side: 'left' | 'right';
  jointId: string;
  jointName: string;
  partId: string | null;
  partName: string;
  /** The part's name says the other side ("Right Wheel" driven as the left wheel). */
  nameMismatch: boolean;
}

export interface WheelAssignment {
  left: WheelSide;
  right: WheelSide;
  warnings: string[];
}

const says = (name: string, side: 'left' | 'right') => new RegExp(`\\b${side}\\b`, 'i').test(name);

export function namingWarning(partName: string, side: 'left' | 'right'): string {
  return `The part "${partName}" sits on the robot's ${side} side (left is −Z when the robot faces +X), so it is driven as the ${side} wheel. You can rename it in Build Mode.`;
}

export function wheelAssignment(controller: DifferentialDriveController, objects: readonly SceneObject[], joints: readonly RobotJoint[]): WheelAssignment {
  const sideOf = (side: 'left' | 'right', jointId: string): WheelSide => {
    const joint = joints.find((j) => j.id === jointId);
    const part = joint ? objects.find((o) => o.id === joint.childId) : undefined;
    const partName = part?.name ?? 'missing part';
    const other = side === 'left' ? 'right' : 'left';
    return { side, jointId, jointName: joint?.name ?? 'missing joint', partId: part?.id ?? null, partName, nameMismatch: Boolean(part) && says(partName, other) && !says(partName, side) };
  };
  const left = sideOf('left', controller.leftJointId);
  const right = sideOf('right', controller.rightJointId);
  const warnings: string[] = [];
  for (const s of [left, right]) if (s.nameMismatch) warnings.push(namingWarning(s.partName, s.side));
  // The geometry warning (the controller's left wheel is physically on the right) stays as measured.
  const measured = measureDriveGeometry(controller, objects, joints);
  if (measured.ok) warnings.push(...measured.geometry.warnings);
  return { left, right, warnings };
}
