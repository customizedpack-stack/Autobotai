import { useState } from 'react';
import { Button } from '../../../components/common/Button';
import { Modal } from '../../../components/common/Modal';
import { cn } from '../../../utils/cn';
import { setExecutionTarget } from '../connectionManager';
import { useHardwareStore } from '../hardwareStore';

/**
 * Code Studio execution target. Simulation is the default. Physical Hardware needs a
 * connected device and an explicit confirmation every time; after a physical run the
 * target returns to Simulation by itself (never the other way round).
 */
export function ExecutionTargetSelect({ disabled }: { disabled?: boolean }) {
  const target = useHardwareStore((s) => s.executionTarget);
  const connected = useHardwareStore((s) => s.phase === 'open');
  const simulated = useHardwareStore((s) => s.method === 'simulated');
  const [confirm, setConfirm] = useState(false);
  return (
    <>
      <label className="flex items-center gap-1 text-[11px] text-muted">
        Target
        <select
          className={cn('h-7 rounded-md border bg-app px-1.5 text-[12px] outline-none', target === 'physical' ? 'border-err text-err' : 'border-line text-ink')}
          value={target}
          disabled={disabled}
          onChange={(e) => {
            if (e.target.value === 'physical') setConfirm(true);
            else setExecutionTarget('simulation', true);
          }}
          data-testid="exec-target"
          aria-label="Execution target"
        >
          <option value="simulation">Simulation</option>
          <option value="physical" disabled={!connected}>
            {simulated ? 'Physical hardware (simulated device)' : 'Physical hardware'}
          </option>
        </select>
      </label>
      <Modal
        open={confirm}
        title="Run on the physical robot?"
        onClose={() => setConfirm(false)}
        footer={
          <>
            <Button onClick={() => setConfirm(false)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => {
                setExecutionTarget('physical', true);
                setConfirm(false);
              }}
              data-testid="exec-target-confirm"
            >
              Use physical hardware
            </Button>
          </>
        }
      >
        <p className="text-[13px] text-muted">
          The next Run sends this program's motion to the {simulated ? 'simulated device (no hardware)' : 'real robot'}. It only starts if the robot is armed and this exact program was deployed in Blueprint → Hardware. Keep the emergency stop and the motor-power switch within reach.
        </p>
      </Modal>
    </>
  );
}
