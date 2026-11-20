import type { ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';
import { Badge } from '../../../components/common/Badge';
import { cn } from '../../../utils/cn';
import { sanitizeUrl } from '../catalog/catalog';
import { SPEC_LABELS, type CatalogPart } from '../catalog/types';
import type { CompatStatus } from '../engine/compatibility';
import { STATUS_LABEL, formatSpec } from './format';



const STATUS_TONE = { compatible: 'ok', warning: 'warn', incompatible: 'err', unknown: 'neutral', 'not-checked': 'neutral' } as const;

export function StatusBadge({ status, testId }: { status: CompatStatus | 'not-checked'; testId?: string }) {
  return (
    <span data-testid={testId} data-status={status}>
      <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
    </span>
  );
}

export function VerificationBadge({ part }: { part: CatalogPart }) {
  const tone = part.verification === 'verified' ? 'ok' : part.verification === 'partial' ? 'accent' : 'warn';
  const label = part.verification === 'verified' ? 'Verified' : part.verification === 'partial' ? 'Partly verified' : 'Unverified';
  return (
    <span title={`Checked ${part.source.verifiedAt} (${part.source.kind.replace('-', ' ')})`}>
      <Badge tone={tone}>{label}</Badge>
    </span>
  );
}

/** External documentation link: https only, opens in a new tab without a referrer. */
export function DocLink({ href, children, testId }: { href: string | null; children: ReactNode; testId?: string }) {
  const safe = sanitizeUrl(href);
  if (!safe) return <span className="text-faint">{children}: not available</span>;
  return (
    <a href={safe} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-accent hover:underline" data-testid={testId}>
      {children}
      <ExternalLink size={11} />
    </a>
  );
}


export function SpecTable({ part, compact = false }: { part: CatalogPart; compact?: boolean }) {
  const rows = SPEC_LABELS.filter((r) => part.specs[r.key] !== undefined);
  return (
    <dl className={cn('grid gap-x-3 gap-y-0.5 text-[11px]', compact ? 'grid-cols-[auto_1fr]' : 'grid-cols-[auto_1fr] sm:grid-cols-[auto_1fr_auto_1fr]')}>
      {rows.map((r) => (
        <div key={r.key} className="contents">
          <dt className="text-muted">{r.label}</dt>
          <dd className="font-mono text-ink">{formatSpec(part.specs[r.key], r.unit)}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Section({ title, children, actions, testId }: { title: string; children: ReactNode; actions?: ReactNode; testId?: string }) {
  return (
    <section className="rounded-lg border border-line bg-panel-2" data-testid={testId}>
      <header className="flex flex-wrap items-center gap-2 border-b border-line-soft px-3 py-2">
        <h3 className="text-[12px] font-semibold">{title}</h3>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">{actions}</div>
      </header>
      <div className="p-3">{children}</div>
    </section>
  );
}


