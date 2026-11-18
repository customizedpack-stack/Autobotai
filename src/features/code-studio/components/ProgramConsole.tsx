import { useEffect, useMemo, useRef, useState } from 'react';
import { useConsoleStore } from '../../../stores/consoleStore';
import type { LogLevel } from '../../../types/console';
import { cn } from '../../../utils/cn';
import { formatClock } from '../../../utils/format';
import { useExecutionStore } from '../runtime/executionStore';

const LEVEL: Record<LogLevel, { label: string; style: string }> = {
  info: { label: 'INFO', style: 'text-accent' },
  success: { label: 'INFO', style: 'text-ok' },
  warning: { label: 'WARNING', style: 'text-warn' },
  error: { label: 'ERROR', style: 'text-err' },
  debug: { label: 'DEBUG', style: 'text-faint' },
};

const short = (id?: string) => (id ? id.slice(-6) : '');

/** Program output and execution log (Code Studio entries of the console, with session and command ids). */
export function ProgramConsole() {
  const entries = useConsoleStore((s) => s.entries);
  const sessionId = useExecutionStore((s) => s.sessionId);
  const [currentOnly, setCurrentOnly] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const shown = useMemo(
    () => entries.filter((e) => e.source === 'code' && (!currentOnly || !sessionId || e.sessionId === sessionId)),
    [entries, currentOnly, sessionId],
  );
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [shown.length]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-6 shrink-0 items-center gap-3 border-b border-line-soft px-3 text-[10.5px] text-faint">
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={currentOnly} onChange={(e) => setCurrentOnly(e.target.checked)} className="accent-[#3b82f6]" />
          Current run only
        </label>
        <span>Session {short(sessionId ?? undefined) || '—'}</span>
      </div>
      <div ref={ref} className="min-h-0 flex-1 overflow-y-auto px-3 py-1 font-mono text-[11px]" data-testid="program-log" role="log" aria-live="polite">
        {shown.length === 0 ? (
          <p className="py-2 text-faint">Run a program to see its output and commands here.</p>
        ) : (
          shown.map((e) => (
            <div key={e.id} className="flex gap-2 leading-5">
              <span className="shrink-0 text-faint">{formatClock(e.timestamp)}</span>
              <span className={cn('w-16 shrink-0', LEVEL[e.level].style)}>[{LEVEL[e.level].label}]</span>
              <span className="w-12 shrink-0 text-faint" title={e.sessionId ? `Session ${e.sessionId}` : undefined}>
                {short(e.sessionId)}
              </span>
              <span className="min-w-0 flex-1 break-words text-ink">{e.message}</span>
              {e.commandId && (
                <span className="shrink-0 text-faint" title={`Command ${e.commandId}`}>
                  {short(e.commandId)}
                </span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
