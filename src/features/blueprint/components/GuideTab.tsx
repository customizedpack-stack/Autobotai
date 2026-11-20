import { BookOpen } from 'lucide-react';
import { Button } from '../../../components/common/Button';
import { EmptyState } from '../../../components/common/EmptyState';
import { cn } from '../../../utils/cn';
import { markGuideGenerated, setStepNote, setStepStatus } from '../blueprintActions';
import { GUIDE_SECTIONS, guideProgress, stepState } from '../engine/guide';
import type { StepStatus } from '../model/types';
import { Section } from './shared';
import { formatTime, inputClass } from './format';
import type { BlueprintView } from './useBlueprintView';

const STATUSES: { id: StepStatus; label: string }[] = [
  { id: 'not-started', label: 'Not started' },
  { id: 'in-progress', label: 'In progress' },
  { id: 'completed', label: 'Completed' },
  { id: 'blocked', label: 'Blocked' },
];

const TONE: Record<StepStatus, string> = { 'not-started': 'text-muted', 'in-progress': 'text-accent', completed: 'text-ok', blocked: 'text-err' };

export function GuideTab({ view }: { view: BlueprintView }) {
  const { guide, data } = view;
  const progress = guideProgress(guide, data.guide.steps);
  if (!data.guide.generatedAt)
    return (
      <EmptyState
        icon={<BookOpen size={18} />}
        title="No Build Guide yet"
        description="Generate a step-by-step guide from the mapped parts, wiring and compatibility results. Steps are never completed automatically."
        action={
          <Button variant="primary" size="sm" onClick={markGuideGenerated} data-testid="guide-generate">
            Generate Build Guide
          </Button>
        }
      />
    );
  return (
    <div className="space-y-3" data-testid="guide-tab">
      <div className="flex flex-wrap items-center gap-3 text-[12px]">
        <Button size="sm" onClick={markGuideGenerated} data-testid="guide-regenerate">
          Update guide
        </Button>
        <span className="text-[11px] text-muted">Generated {formatTime(data.guide.generatedAt)}. Steps follow the blueprint live; your statuses and notes are kept.</span>
        <span className="ml-auto text-[11px]" data-testid="guide-progress">
          {progress.completed} completed · {progress['in-progress']} in progress · {progress.blocked} blocked · {progress['not-started']} not started
        </span>
      </div>
      {GUIDE_SECTIONS.map((section) => {
        const steps = guide.filter((s) => s.section === section.id);
        return (
          <Section key={section.id} title={section.title} testId={`guide-section-${section.id}`}>
            {steps.length === 0 ? (
              <p className="text-[11px] text-muted">Nothing to do here yet.</p>
            ) : (
              <ol className="space-y-2">
                {steps.map((step) => {
                  const st = stepState(data.guide.steps, step.id);
                  return (
                    <li key={step.id} className="rounded border border-line-soft bg-panel px-2 py-1.5" data-testid={`guide-step-${step.id}`} data-status={st.status}>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className={cn('text-[12px] font-medium', st.status === 'completed' && 'line-through decoration-ok/60')}>{step.title}</p>
                        <select className={cn(inputClass, 'ml-auto', TONE[st.status])} value={st.status} onChange={(e) => setStepStatus(step.id, step.title, e.target.value as StepStatus)} data-testid={`step-status-${step.id}`} aria-label={`Status of ${step.title}`}>
                          {STATUSES.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <p className="text-[11px] text-muted">{step.detail}</p>
                      {step.attention && <p className="mt-0.5 text-[11px] text-warn">{step.attention}</p>}
                      <textarea
                        className="mt-1 w-full rounded-md border border-line bg-app px-2 py-1 text-[11px] outline-none focus:border-accent"
                        rows={1}
                        placeholder="Your notes"
                        defaultValue={st.note}
                        key={st.note}
                        maxLength={2000}
                        onBlur={(e) => setStepNote(step.id, step.title, e.target.value)}
                        data-testid={`step-note-${step.id}`}
                        aria-label={`Notes for ${step.title}`}
                      />
                    </li>
                  );
                })}
              </ol>
            )}
          </Section>
        );
      })}
    </div>
  );
}
