import { Badge } from '../../../components/common/Badge';
import { DIFFICULTY_LABEL } from '../catalog/projects';
import { CAPABILITY_LABEL, type Capability, type CapabilityStatus, type ProjectDefinition } from '../model/types';

const STATUS_TONE: Record<CapabilityStatus, 'ok' | 'warn' | 'err' | 'accent' | 'neutral'> = {
  supported: 'ok',
  'simulation-only': 'accent',
  'build-guide': 'neutral',
  'hardware-deployment': 'warn',
  'requires-configuration': 'warn',
  'not-yet-supported': 'err',
};

export function CapabilityBadge({ status }: { status: CapabilityStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{CAPABILITY_LABEL[status]}</Badge>;
}

export function DifficultyBadge({ difficulty }: { difficulty: ProjectDefinition['difficulty'] }) {
  return <Badge tone={difficulty === 'beginner' ? 'ok' : difficulty === 'intermediate' ? 'accent' : 'warn'}>{DIFFICULTY_LABEL[difficulty]}</Badge>;
}

export function CapabilityList({ items, testId }: { items: readonly Capability[]; testId: string }) {
  return (
    <ul className="space-y-2" data-testid={testId}>
      {items.map((c) => (
        <li key={c.id} className="rounded-md border border-line-soft bg-app/50 p-2.5" data-testid={`cap-${c.id}`} data-status={c.status}>
          <div className="flex flex-wrap items-center gap-2 text-[13px] font-medium">
            {c.label} <CapabilityBadge status={c.status} />
          </div>
          <p className="mt-1 text-xs text-muted">{c.note}</p>
        </li>
      ))}
    </ul>
  );
}

