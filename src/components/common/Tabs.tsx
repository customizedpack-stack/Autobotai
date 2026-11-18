import { cn } from '../../utils/cn';

export interface TabItem<T extends string> {
  id: T;
  label: string;
  count?: number;
}

interface TabsProps<T extends string> {
  items: readonly TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  ariaLabel: string;
}

export function Tabs<T extends string>({ items, value, onChange, className, ariaLabel }: TabsProps<T>) {
  return (
    <div role="tablist" aria-label={ariaLabel} className={cn('flex items-stretch gap-0.5', className)}>
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.id)}
            className={cn(
              'relative inline-flex items-center gap-1.5 px-2.5 text-xs font-medium transition-colors',
              active ? 'text-ink' : 'text-muted hover:text-ink',
            )}
          >
            {item.label}
            {item.count !== undefined && (
              <span className="rounded bg-raised px-1 font-mono text-[10px] text-muted">{item.count}</span>
            )}
            {active && <span className="absolute inset-x-1.5 bottom-0 h-0.5 rounded-full bg-accent" />}
          </button>
        );
      })}
    </div>
  );
}
