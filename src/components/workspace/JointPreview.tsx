import { useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { robotControl } from '../../features/controls/robotControlApi';
import { neutralJointValue } from '../../features/robot-model/kinematics';
import { JOINT_COLORS } from '../../features/viewport/jointStyle';
import { useRobotStateStore } from '../../stores/robotStateStore';
import { useSceneStore } from '../../stores/sceneStore';
import { useSelectionStore } from '../../stores/selectionStore';
import type { RobotJoint } from '../../types/joint';
import { RAD_TO_DEG, DEG_TO_RAD } from '../../utils/math';

/** Display units: degrees for revolute joints, meters for prismatic joints. */
const toDisplay = (joint: RobotJoint, v: number) => (joint.type === 'revolute' ? v * RAD_TO_DEG : v);
const fromDisplay = (joint: RobotJoint, v: number) => (joint.type === 'revolute' ? v * DEG_TO_RAD : v);
const unit = (joint: RobotJoint) => (joint.type === 'revolute' ? '°' : 'm');
const fmt = (joint: RobotJoint, v: number) => toDisplay(joint, v).toFixed(joint.type === 'revolute' ? 1 : 3);

/**
 * Kinematic joint preview: move a revolute or prismatic joint within its
 * limits to check the design. Values go through the C2 command
 * `setJointTarget` (mode "preview"), so they are validated like any command.
 * Preview positions are temporary: not saved and not in undo history.
 */
export function JointPreview() {
  const joints = useSceneStore((s) => s.joints);
  const objects = useSceneStore((s) => s.objects);
  const selectedJointId = useSelectionStore((s) => s.selectedJointId);
  const positions = useRobotStateStore((s) => s.jointPositions);
  const movable = joints.filter((j) => j.type !== 'fixed');
  const fixedCount = joints.length - movable.length;
  const [jointId, setJointId] = useState<string>(movable[0]?.id ?? '');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Selecting a joint in the tree or viewport picks it here.
  useEffect(() => {
    if (selectedJointId && movable.some((j) => j.id === selectedJointId)) setJointId(selectedJointId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedJointId]);

  const joint = movable.find((j) => j.id === jointId) ?? movable[0];
  if (!joint) {
    return <p className="text-xs text-muted">This robot has no revolute or prismatic joints to preview{fixedCount ? ` (${fixedCount} fixed joint(s) cannot move)` : ''}.</p>;
  }
  const value = positions[joint.id] ?? 0;
  const child = objects.find((o) => o.id === joint.childId);
  const send = (v: number) => {
    const result = robotControl.joint(joint.id).preview(v, 'panel');
    setError(result.ok ? null : result.errors.join(' '));
    return result.ok;
  };
  const step = joint.type === 'revolute' ? 0.5 : 0.001;

  return (
    <div data-testid="joint-preview">
      <label className="block">
        <span className="mb-1 block text-[11px] text-muted">Joint</span>
        <select
          value={joint.id}
          onChange={(e) => {
            setJointId(e.target.value);
            setError(null);
          }}
          aria-label="Joint to preview"
          data-testid="preview-joint-select"
          className="h-8 w-full rounded-md border border-line bg-app px-2 text-xs outline-none focus:border-accent"
        >
          {movable.map((j) => (
            <option key={j.id} value={j.id}>
              {j.name} ({j.type})
            </option>
          ))}
        </select>
      </label>
      <div className="mt-2 flex items-center justify-between text-[11px]">
        <span className="flex items-center gap-1.5 text-muted">
          <span className="h-2 w-2 rounded-full" style={{ background: JOINT_COLORS[joint.type] }} />
          {child?.name ?? 'child'} · {joint.type}
        </span>
        <span className="font-mono text-ink" data-testid="preview-value">
          {fmt(joint, value)} {unit(joint)}
        </span>
      </div>
      <input
        type="range"
        min={toDisplay(joint, joint.limits.lower)}
        max={toDisplay(joint, joint.limits.upper)}
        step={step}
        value={toDisplay(joint, value)}
        onChange={(e) => send(fromDisplay(joint, Number(e.target.value)))}
        aria-label={`${joint.name} position`}
        data-testid="preview-slider"
        className="mt-1 w-full accent-[#3B82F6]"
      />
      <div className="flex justify-between font-mono text-[10px] text-faint" data-testid="preview-limits">
        <span>
          {fmt(joint, joint.limits.lower)} {unit(joint)}
        </span>
        <span>
          {fmt(joint, joint.limits.upper)} {unit(joint)}
        </span>
      </div>
      <div className="mt-2 flex gap-1.5">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && text.trim()) {
              if (send(fromDisplay(joint, Number(text)))) setText('');
            }
          }}
          placeholder={`Type a value (${unit(joint)}) and press Enter`}
          aria-label="Joint position value"
          data-testid="preview-input"
          className="h-7 min-w-0 flex-1 rounded-md border border-line bg-app px-2 font-mono text-[11px] outline-none focus:border-accent"
        />
        <button
          type="button"
          onClick={() => send(neutralJointValue(joint))}
          data-testid="preview-neutral"
          className="inline-flex h-7 items-center gap-1 rounded-md border border-line px-2 text-[11px] text-muted hover:text-ink"
          title="Return to the neutral position"
        >
          <RotateCcw size={11} /> Neutral
        </button>
      </div>
      {error && (
        <p className="mt-1.5 text-[11px] text-err" data-testid="preview-error">
          {error}
        </p>
      )}
      <p className="mt-2 text-[10.5px] text-faint">
        Kinematic joint preview. Temporary test pose, not saved. {fixedCount > 0 && `${fixedCount} fixed joint(s) cannot move and have no slider.`}
      </p>
    </div>
  );
}
