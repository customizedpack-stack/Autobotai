import type { Vec3 } from '../../types/scene';
import { NumberField } from './NumberField';

const AXIS_COLORS = ['#EF4444', '#22C55E', '#3B82F6'] as const;
const AXIS_LABELS = ['X', 'Y', 'Z'] as const;

/** Three axis fields (X/Y/Z) that commit one vector. Shared by component and joint inspectors. */
export interface VectorRowProps {
  label: string;
  unit: string;
  values: Vec3;
  step: number;
  decimals: number;
  min?: number;
  testId: string;
  onCommit: (values: Vec3) => void;
}

export function VectorRow({ label, unit, values, step, decimals, min, testId, onCommit }: VectorRowProps) {
  return (
    <div className="mb-2 last:mb-0">
      <div className="mb-1 flex items-center justify-between text-[11px] text-muted">
        <span>{label}</span>
        <span className="font-mono text-[10px] text-faint">{unit}</span>
      </div>
      <div className="grid grid-cols-3 gap-1">
        {values.map((value, axis) => (
          <NumberField
            key={AXIS_LABELS[axis]}
            label={AXIS_LABELS[axis]}
            tagColor={AXIS_COLORS[axis]}
            value={value}
            step={step}
            decimals={decimals}
            min={min}
            testId={`${testId}-${AXIS_LABELS[axis].toLowerCase()}`}
            onCommit={(next) => {
              const updated: Vec3 = [...values];
              updated[axis] = next;
              onCommit(updated);
            }}
          />
        ))}
      </div>
    </div>
  );
}

