import type { CompatStatus } from '../engine/compatibility';

export const STATUS_LABEL: Record<CompatStatus | 'not-checked', string> = {
  compatible: 'Compatible',
  warning: 'Warning',
  incompatible: 'Incompatible',
  unknown: 'Unknown',
  'not-checked': 'Not checked',
};

export function formatSpec(value: unknown, unit: string): string {
  if (value === undefined || value === null) return 'Unknown';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'number') return `${Math.round(value * 1000) / 1000}${unit ? ` ${unit}` : ''}`;
  return String(value);
}

export const inputClass = 'h-7 rounded-md border border-line bg-app px-2 text-[12px] outline-none focus:border-accent';

export function formatTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}
