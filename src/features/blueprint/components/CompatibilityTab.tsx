import { ShieldCheck } from 'lucide-react';
import { EmptyState } from '../../../components/common/EmptyState';
import { AREA_LABELS, summarize, type CompatArea } from '../engine/compatibility';
import { Section, StatusBadge } from './shared';
import type { BlueprintView } from './useBlueprintView';

const ORDER: CompatArea[] = ['motor-driver', 'controller-sensor', 'power', 'mechanical', 'catalog'];

export function CompatibilityTab({ view }: { view: BlueprintView }) {
  const counts = summarize(view.checks);
  if (view.data.mappings.length === 0)
    return <EmptyState icon={<ShieldCheck size={18} />} title="Nothing to check yet" description="Map real parts in the Real Parts tab. Checks run as soon as two related parts are mapped." />;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-[12px]" data-testid="compat-summary" data-incompatible={counts.incompatible} data-warning={counts.warning} data-unknown={counts.unknown}>
        <span>
          <b className="text-ok">{counts.compatible}</b> compatible
        </span>
        <span>
          <b className="text-warn">{counts.warning}</b> warnings
        </span>
        <span>
          <b className="text-err">{counts.incompatible}</b> incompatible
        </span>
        <span>
          <b className="text-muted">{counts.unknown}</b> unknown
        </span>
      </div>
      <p className="text-[11px] text-muted">
        Checks use only the saved part data. Missing data gives <b>Unknown</b>, never Compatible. This is a design aid based on datasheet values, not a safety certification: verify voltages with a meter before powering anything.
      </p>
      {ORDER.map((area) => {
        const list = view.checks.filter((c) => c.area === area);
        if (list.length === 0) return null;
        return (
          <Section key={area} title={AREA_LABELS[area]} testId={`compat-area-${area}`}>
            <ul className="space-y-1.5">
              {list.map((c) => (
                <li key={c.id} className="flex gap-2 text-[12px]" data-testid={`compat-check-${c.id}`} data-status={c.status}>
                  <StatusBadge status={c.status} />
                  <div>
                    <p className="font-medium">{c.title}</p>
                    <p className="text-[11px] text-muted">{c.reason}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Section>
        );
      })}
    </div>
  );
}
