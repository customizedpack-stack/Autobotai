import { Badge } from '../../../components/common/Badge';
import { useExecutionStore } from '../runtime/executionStore';
import { EXECUTION_STATE_LABEL, type ExecutionState } from '../runtime/executionTypes';

const TONE: Record<ExecutionState, 'neutral' | 'accent' | 'ok' | 'warn' | 'err'> = {
  idle: 'neutral',
  preparing: 'accent',
  running: 'accent',
  paused: 'warn',
  stopping: 'warn',
  completed: 'ok',
  error: 'err',
};

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`;
}

/** Execution state badge with run time. */
export function ExecutionStatus() {
  const state = useExecutionStore((s) => s.state);
  const elapsed = useExecutionStore((s) => s.elapsedMs);
  const outcome = useExecutionStore((s) => s.lastOutcome);
  const label = state === 'idle' && outcome === 'stopped' ? 'Stopped' : EXECUTION_STATE_LABEL[state];
  const showTime = state === 'running' || state === 'paused' || state === 'completed';
  return (
    <span className="flex items-center gap-1.5" title="Program execution status" data-testid="execution-status-wrap">
      <Badge tone={TONE[state]}>
        {state === 'running' && <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />}
        <span data-testid="execution-status">{label}</span>
      </Badge>
      {showTime && (
        <span className="font-mono text-[10.5px] text-faint" data-testid="execution-time">
          {seconds(elapsed)}
        </span>
      )}
    </span>
  );
}
