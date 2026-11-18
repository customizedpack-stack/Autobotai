import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';

type Tone = 'neutral' | 'accent' | 'ok' | 'warn' | 'err';

const TONES: Record<Tone, string> = {
  neutral: 'bg-raised text-muted border-line',
  accent: 'bg-accent-soft text-accent border-accent/30',
  ok: 'bg-ok/10 text-ok border-ok/30',
  warn: 'bg-warn/10 text-warn border-warn/30',
  err: 'bg-err/10 text-err border-err/30',
};

export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 shrink-0 items-center rounded border px-1.5 text-[10.5px] font-medium tracking-wide uppercase',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
