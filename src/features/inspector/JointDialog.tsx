import { useMemo, useState } from 'react';
import { Button } from '../../components/common/Button';
import { Modal } from '../../components/common/Modal';
import { useSceneStore } from '../../stores/sceneStore';
import { useSelectionStore } from '../../stores/selectionStore';
import type { JointType } from '../../types/joint';
import { cn } from '../../utils/cn';
import { flattenTree, reparentError } from '../robot-model/hierarchy';
import { DEFAULT_AXIS, DEFAULT_LIMITS, JOINT_TYPES, validateJoint } from '../robot-model/joints';
import { robotModel } from '../robot-model/robotModelConnector';

interface JointDialogProps {
  open: boolean;
  onClose: () => void;
  /** Pre-selected child component. */
  childId: string | null;
}

/** Create a joint between two components, with live validation. */
export function JointDialog({ open, onClose, childId }: JointDialogProps) {
  if (!open) return null;
  return <JointDialogBody onClose={onClose} initialChildId={childId} />;
}

function JointDialogBody({ onClose, initialChildId }: { onClose: () => void; initialChildId: string | null }) {
  const objects = useSceneStore((s) => s.objects);
  const joints = useSceneStore((s) => s.joints);
  const initialChild = objects.find((o) => o.id === initialChildId);
  const [childId, setChildId] = useState(initialChildId ?? '');
  const [parentId, setParentId] = useState(initialChild?.parentId ?? '');
  const [type, setType] = useState<JointType>('revolute');
  const [name, setName] = useState('');

  const order = useMemo(() => flattenTree(objects), [objects]);
  const byId = useMemo(() => new Map(objects.map((o) => [o.id, o])), [objects]);
  const child = byId.get(childId);
  const parent = byId.get(parentId);

  const errors = useMemo(() => {
    if (!childId || !parentId) return ['Choose a parent and a child component.'];
    const list: string[] = [];
    if (child && child.parentId !== parentId) {
      const hierarchyError = reparentError(objects, childId, parentId);
      if (hierarchyError) list.push(hierarchyError);
    }
    list.push(
      ...validateJoint(
        {
          type,
          parentId,
          childId,
          axis: DEFAULT_AXIS[type],
          limits: DEFAULT_LIMITS[type],
          origin: { position: [0, 0, 0], rotation: [0, 0, 0] },
        },
        objects,
        joints,
      ),
    );
    return [...new Set(list)];
  }, [childId, parentId, type, child, objects, joints]);

  const create = () => {
    const result = robotModel.createJoint({ type, parentId, childId, name: name.trim() || undefined });
    if (result.ok) {
      useSelectionStore.getState().selectJoint(result.value.id);
      onClose();
    }
  };

  const select = (value: string, onChange: (v: string) => void, label: string, testId: string) => (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      data-testid={testId}
      className="h-8 w-full rounded-md border border-line bg-app px-2 text-[13px] outline-none focus:border-accent"
    >
      <option value="">Choose…</option>
      {order.map(({ id, depth }) => (
        <option key={id} value={id}>
          {'  '.repeat(depth)}
          {byId.get(id)?.name}
        </option>
      ))}
    </select>
  );

  return (
    <Modal
      open
      title="Create joint"
      onClose={onClose}
      width={460}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={create} disabled={errors.length > 0} data-testid="create-joint">
            Create joint
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-[13px]">
        <div>
          <div className="mb-1 text-[11px] text-muted">Joint type</div>
          <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Joint type">
            {JOINT_TYPES.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={type === t.id}
                onClick={() => setType(t.id)}
                className={cn('rounded-md border p-2 text-left', type === t.id ? 'border-accent bg-accent-soft' : 'border-line hover:border-[#3d4553]')}
              >
                <div className="text-xs font-semibold">{t.label}</div>
                <div className="mt-0.5 text-[10.5px] leading-snug text-muted">{t.description}</div>
              </button>
            ))}
          </div>
        </div>
        <label className="block">
          <span className="mb-1 block text-[11px] text-muted">Parent component (stays put)</span>
          {select(parentId, setParentId, 'Joint parent', 'joint-parent')}
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] text-muted">Child component (moves on the joint)</span>
          {select(childId, setChildId, 'Joint child', 'joint-child')}
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] text-muted">Name (optional)</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={parent && child ? `${parent.name} → ${child.name}` : 'Joint name'}
            className="h-8 w-full rounded-md border border-line bg-app px-2 outline-none focus:border-accent"
          />
        </label>
        {child && parent && child.parentId !== parent.id && errors.length === 0 && (
          <p className="rounded-md bg-app p-2 text-[11.5px] text-muted">
            “{child.name}” will also be attached to “{parent.name}” so it moves with it. Its position in the world stays the same.
          </p>
        )}
        {errors.length > 0 && childId && parentId && (
          <ul className="space-y-1 text-[11.5px] text-err" data-testid="joint-errors">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
