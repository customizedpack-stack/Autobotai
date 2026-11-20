import { OctagonX } from 'lucide-react';
import { emergencyStop } from '../connectionManager';
import { useHardwareStore } from '../hardwareStore';

/**
 * Always-visible emergency stop while a device is connected (every workspace mode).
 * It sends the latched ESTOP command. It is NOT a substitute for the motor-power switch on the robot.
 */
export function EmergencyStopButton() {
  const open = useHardwareStore((s) => s.phase === 'open');
  const estop = useHardwareStore((s) => s.deviceState === 'estop');
  const simulated = useHardwareStore((s) => s.method === 'simulated');
  if (!open) return null;
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      {simulated && (
        <span className="rounded border border-warn/60 bg-warn/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-warn uppercase" title="Connected to the simulated device. No physical hardware is involved." data-testid="hw-sim-badge">
          Simulated device
        </span>
      )}
      <button
      type="button"
      onClick={() => void emergencyStop()}
      className="flex h-8 shrink-0 items-center gap-1.5 rounded-md border-2 border-err bg-err px-2.5 text-xs font-bold tracking-wide text-white uppercase shadow hover:bg-[#dc2626] focus:ring-2 focus:ring-err/50 focus:outline-none"
      title={`Emergency stop: disables the ${simulated ? 'simulated device' : 'robot'}'s motors at once (latched until reset). Use the motor-power switch on the robot as well.`}
      aria-label="Emergency stop"
      data-testid="estop"
      data-active={estop}
    >
      <OctagonX size={15} />
      {estop ? 'E-stopped' : 'E-stop'}
      </button>
    </div>
  );
}
