import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { cn } from '../../utils/cn';

interface NumberFieldProps {
  label: string;
  /** Color of the axis tag (X red, Y green, Z blue). */
  tagColor?: string;
  value: number;
  step: number;
  decimals?: number;
  min?: number;
  onCommit: (value: number) => void;
  testId?: string;
}

/**
 * Numeric input that commits on Enter or blur (one undo step per edit),
 * reverts on Escape, and nudges with the arrow keys (Shift = ×10).
 */
export function NumberField({ label, tagColor, value, step, decimals = 3, min, onCommit, testId }: NumberFieldProps) {
  const format = (v: number) => String(Number(v.toFixed(decimals)));
  const [text, setText] = useState(format(value));
  const focused = useRef(false);
  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
  }, [value]);

  useEffect(() => {
    if (!focused.current) setText(format(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, decimals]);

  const commit = (raw: string) => {
    const parsed = Number(raw);
    if (raw.trim() === '' || !Number.isFinite(parsed)) {
      setText(format(value));
      return;
    }
    const next = min !== undefined ? Math.max(min, parsed) : parsed;
    setText(format(next));
    if (next !== value) {
      onCommit(next);
      // If the edit was rejected (validation), show the stored value again.
      window.setTimeout(() => {
        if (!focused.current) setText(format(latest.current));
      }, 0);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      // Blurring commits (see onBlur), so Enter never commits twice.
      event.currentTarget.blur();
    } else if (event.key === 'Escape') {
      setText(format(value));
      event.currentTarget.blur();
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      const base = Number.isFinite(Number(text)) ? Number(text) : value;
      const delta = (event.key === 'ArrowUp' ? step : -step) * (event.shiftKey ? 10 : 1);
      const next = Number((base + delta).toFixed(decimals));
      setText(format(next));
      commit(String(next));
    }
  };

  return (
    <label className="group flex h-7 min-w-0 items-center overflow-hidden rounded-md border border-line bg-app focus-within:border-accent">
      <span
        className="flex h-full w-5 shrink-0 items-center justify-center border-r border-line-soft font-mono text-[10px] font-bold"
        style={{ color: tagColor ?? '#94A3B8' }}
      >
        {label}
      </span>
      <input
        type="text"
        inputMode="decimal"
        value={text}
        data-testid={testId}
        aria-label={`${label} value`}
        onFocus={(event) => {
          focused.current = true;
          event.currentTarget.select();
        }}
        onBlur={(event) => {
          focused.current = false;
          commit(event.currentTarget.value);
        }}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKeyDown}
        className={cn('h-full w-full min-w-0 bg-transparent px-1.5 text-right font-mono text-[11.5px] outline-none')}
      />
    </label>
  );
}
