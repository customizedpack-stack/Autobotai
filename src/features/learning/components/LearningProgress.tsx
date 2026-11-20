import { Link } from 'react-router-dom';
import { ArrowRight, GraduationCap } from 'lucide-react';
import { TUTORIALS } from '../catalog/tutorials';
import { tutorialHref, useProgressEntries } from './progressEntries';

export function ContinueLearning() {
  const entries = useProgressEntries().filter((e) => !e.progress.completedAt);
  return (
    <section aria-labelledby="continue-heading" data-testid="continue-learning">
      <h2 id="continue-heading" className="mb-3 text-sm font-semibold">
        Continue Learning
      </h2>
      {entries.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line p-4 text-xs text-muted">
          No tutorial in progress.{' '}
          <Link to="/learn" className="text-accent hover:underline">
            Choose a tutorial
          </Link>
          .
        </div>
      ) : (
        <ul className="space-y-2">
          {entries.slice(0, 4).map((e) => (
            <li key={`${e.tutorial.id}-${e.progress.projectId}`}>
              <Link
                to={tutorialHref(e.tutorial.id, e.progress.projectId)}
                className="flex items-center gap-3 rounded-lg border border-line bg-panel p-3 hover:border-[#3d4553]"
                aria-label={`Resume ${e.tutorial.title} with ${e.projectName}`}
                data-testid="resume-tutorial"
              >
                <GraduationCap size={16} className="shrink-0 text-accent" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold">{e.tutorial.title}</span>
                  <span className="block truncate text-[11px] text-muted">
                    {e.projectName} · step {e.progress.currentStep + 1} of {e.tutorial.steps.length} · {e.done} done
                  </span>
                </span>
                <span className="h-1.5 w-16 shrink-0 overflow-hidden rounded bg-raised" aria-hidden>
                  <span className="block h-full bg-accent" style={{ width: `${Math.round((e.done / e.tutorial.steps.length) * 100)}%` }} />
                </span>
                <ArrowRight size={13} className="text-faint" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function LearningProgressSummary() {
  const entries = useProgressEntries();
  const completed = entries.filter((e) => e.progress.completedAt).length;
  const steps = entries.reduce((n, e) => n + e.done, 0);
  return (
    <section aria-labelledby="progress-heading" className="rounded-lg border border-line bg-panel p-4" data-testid="learning-progress">
      <h2 id="progress-heading" className="text-sm font-semibold">
        Learning Progress
      </h2>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div>
          <dt className="text-[10.5px] text-faint uppercase">Started</dt>
          <dd className="text-lg font-semibold" data-testid="progress-started">{entries.length}</dd>
        </div>
        <div>
          <dt className="text-[10.5px] text-faint uppercase">Completed</dt>
          <dd className="text-lg font-semibold" data-testid="progress-completed">{completed}</dd>
        </div>
        <div>
          <dt className="text-[10.5px] text-faint uppercase">Steps done</dt>
          <dd className="text-lg font-semibold">{steps}</dd>
        </div>
      </dl>
      <p className="mt-2 text-[11px] text-faint">Out of {TUTORIALS.length} guided tutorials. Progress is stored in this browser.</p>
    </section>
  );
}
