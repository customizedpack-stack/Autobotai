import { useEffect, useRef } from 'react';
import { ALL_LEVELS, useConsoleStore } from '../../stores/consoleStore';
import type { LogLevel } from '../../types/console';
import { cn } from '../../utils/cn';
import { formatClock } from '../../utils/format';

const LEVEL_STYLE: Record<LogLevel, string> = {
  info: 'text-accent',
  success: 'text-ok',
  warning: 'text-warn',
  error: 'text-err',
  debug: 'text-faint',
};

export function ConsoleLevelFilters() {
  const levelFilter = useConsoleStore((s) => s.levelFilter);
  const toggleLevel = useConsoleStore((s) => s.toggleLevel);
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Log level filters">
      {ALL_LEVELS.map((level) => (
        <button
          key={level}
          type="button"
          aria-pressed={levelFilter[level]}
          onClick={() => toggleLevel(level)}
          className={cn(
            'h-5 rounded px-1.5 text-[10.5px] capitalize transition-colors',
            levelFilter[level] ? 'bg-raised text-ink' : 'text-faint hover:text-muted',
          )}
        >
          {level}
        </button>
      ))}
    </div>
  );
}

function useAutoScroll(dependency: unknown) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [dependency]);
  return ref;
}

export function ConsoleView() {
  const entries = useConsoleStore((s) => s.entries);
  const levelFilter = useConsoleStore((s) => s.levelFilter);
  const visible = entries.filter((e) => levelFilter[e.level]);
  const ref = useAutoScroll(visible.length);

  return (
    <div ref={ref} className="h-full overflow-y-auto py-1 font-mono text-[11.5px]" data-testid="console-log" role="log" aria-live="polite">
      {visible.length === 0 ? (
        <p className="px-3 py-2 text-faint">No messages.</p>
      ) : (
        visible.map((entry) => (
          <div key={entry.id} className="flex gap-3 px-3 py-0.5 hover:bg-raised/50">
            <span className="shrink-0 text-faint">{formatClock(entry.timestamp)}</span>
            <span className={cn('w-14 shrink-0 uppercase', LEVEL_STYLE[entry.level])}>{entry.level}</span>
            <span className="w-20 shrink-0 truncate text-muted">{entry.source}</span>
            <span className="min-w-0 text-ink/90">{entry.message}</span>
          </div>
        ))
      )}
    </div>
  );
}

/** Raw Connector Bus traffic (everything except console messages). */
export function EventsView() {
  const events = useConsoleStore((s) => s.events);
  const ref = useAutoScroll(events.length);
  return (
    <div ref={ref} className="h-full overflow-y-auto py-1 font-mono text-[11.5px]" data-testid="events-log">
      {events.length === 0 ? (
        <p className="px-3 py-2 text-faint">No bus events yet. Select, move or add an object to see messages flow.</p>
      ) : (
        events.map((event, index) => (
          <div key={`${event.timestamp}-${index}`} className="flex gap-3 px-3 py-0.5 hover:bg-raised/50">
            <span className="shrink-0 text-faint">{formatClock(event.timestamp)}</span>
            <span className="w-40 shrink-0 text-accent">{event.channel}</span>
            <span className="min-w-0 truncate text-muted">{JSON.stringify(event.payload)}</span>
          </div>
        ))
      )}
    </div>
  );
}
