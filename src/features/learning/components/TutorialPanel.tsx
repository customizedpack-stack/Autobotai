import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, ChevronLeft, ChevronRight, Circle, CircleAlert, CircleDashed, Pause, RotateCcw, SkipForward } from 'lucide-react';
import { Badge } from '../../../components/common/Badge';
import { Button } from '../../../components/common/Button';
import { Modal } from '../../../components/common/Modal';
import { useProjectStore } from '../../../stores/projectStore';
import { cn } from '../../../utils/cn';
import { hasUnsavedPrograms } from '../../code-studio/programActions';
import { hasUnsavedProjectChanges } from '../../projects/workspaceActions';
import { physicalSummary } from '../catalog/projects';
import { definitionForTutorial } from '../catalog/tutorials';
import type { CheckContext } from '../engine/checks';
import { goToStep, isStepDone, recordOf, restartTutorial, setManualConfirmed, skipStep, startTutorial, summarize, verifyStep } from '../engine/tutorialEngine';
import type { TutorialDefinition } from '../model/types';
import { progressKey, useLearningStore } from '../store/learningStore';
import { useLearningSession } from '../store/learningSession';
import { runDoAction } from './doActions';

export function TutorialPanel({ tutorial, projectId }: { tutorial: TutorialDefinition; projectId: string }) {
  const def = definitionForTutorial(tutorial);
  const key = progressKey(tutorial.id, projectId);
  const progress = useLearningStore((s) => s.progress[key]);
  const projectName = useProjectStore((s) => s.projects[projectId]?.name ?? '');
  const [restartOpen, setRestartOpen] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const blockly = useRef<CheckContext['generateBlockly']>(undefined);

  // Progress is created when the tutorial opens (resumes when it exists).
  useEffect(() => {
    startTutorial(tutorial, projectId);
  }, [tutorial, projectId]);

  // Block programs are checked through their generated JavaScript (Blockly loads on demand).
  useEffect(() => {
    let alive = true;
    void import('../../code-studio/blockly/generator').then((m) => {
      if (alive) blockly.current = (source) => {
        const g = m.generateFromSource(source);
        return g.ok ? g.code : null;
      };
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!progress || !def) return <div className="p-3 text-xs text-muted">Loading tutorial…</div>;
  const index = Math.min(progress.currentStep, tutorial.steps.length - 1);
  const step = tutorial.steps[index]!;
  const record = recordOf(progress, step.id);
  const ctx: CheckContext = { projectId, generateBlockly: (s) => blockly.current?.(s) ?? null, hasUnsaved: () => hasUnsavedProjectChanges() || hasUnsavedPrograms() };
  const completed = Boolean(progress.completedAt);

  const doAction = (a: (typeof step.actions)[number]) => {
    const result = runDoAction(a, def);
    setActionMessage(result);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="tutorial-panel" data-step={step.id} data-complete={completed}>
      <div className="border-b border-line px-3 py-2">
        <div className="text-[13px] font-semibold">{tutorial.title}</div>
        <div className="text-[11px] text-muted">
          {projectName} · step {index + 1} of {tutorial.steps.length} · {progress.completed.length} done
        </div>
        <ol className="mt-2 flex flex-wrap gap-1" aria-label="Tutorial steps">
          {tutorial.steps.map((s, i) => {
            const r = recordOf(progress, s.id);
            const done = isStepDone(progress, s);
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => goToStep(tutorial, projectId, i)}
                  aria-current={i === index ? 'step' : undefined}
                  aria-label={`Step ${i + 1}: ${s.title}${done ? ' (done)' : r.status === 'failed' ? ' (check failed)' : ''}`}
                  title={s.title}
                  data-testid={`step-dot-${s.id}`}
                  className={cn('flex h-6 w-6 items-center justify-center rounded border text-[10px]', i === index ? 'border-accent text-ink' : 'border-line text-muted', done && 'bg-ok/15 text-ok')}
                >
                  {done ? <CheckCircle2 size={12} aria-hidden /> : r.status === 'failed' ? <CircleAlert size={12} className="text-warn" aria-hidden /> : i + 1}
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 text-[12.5px]">
        {completed && <CompletionSummary tutorial={tutorial} projectId={projectId} />}
        <div className="flex flex-wrap items-center gap-1.5">
          <h2 className="text-sm font-semibold" data-testid="tutorial-step-title">
            {step.title}
          </h2>
          {step.optional && <Badge>Optional</Badge>}
        </div>

        <section aria-label="Learn">
          <h3 className="text-[10.5px] font-semibold tracking-wider text-accent uppercase">Learn</h3>
          <ul className="mt-1 space-y-1 text-muted">
            {step.learn.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </section>

        <section aria-label="Do">
          <h3 className="text-[10.5px] font-semibold tracking-wider text-accent uppercase">Do</h3>
          <ol className="mt-1 list-decimal space-y-1 pl-4 text-muted">
            {step.doText.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ol>
          {step.actions.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {step.actions.map((a) => (
                <Button key={a.label} size="sm" onClick={() => doAction(a)} data-testid={`do-${a.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`}>
                  {a.label}
                </Button>
              ))}
            </div>
          )}
          {actionMessage && (
            <p className="mt-1.5 text-[11px] text-muted" role="status" data-testid="do-message">
              {actionMessage}
            </p>
          )}
        </section>

        <section aria-label="Verify" className="rounded-md border border-line-soft bg-app/40 p-2.5">
          <h3 className="text-[10.5px] font-semibold tracking-wider text-accent uppercase">Verify</h3>
          {step.verify.checks.length > 0 && (
            <>
              <p className="mt-1 text-[11px] text-faint">Automatic check of your actual robot ({step.verify.checks.length}).</p>
              <Button size="sm" variant="primary" className="mt-1.5" onClick={() => verifyStep(tutorial, projectId, index, ctx)} data-testid="verify-step">
                Check my robot
              </Button>
            </>
          )}
          {record.results.length > 0 && (
            <ul className="mt-2 space-y-1.5" data-testid="verify-results">
              {record.results.map((r) => (
                <li key={r.label} className="flex gap-1.5" data-ok={r.ok}>
                  {r.ok ? <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-ok" aria-label="Passed" /> : <CircleAlert size={13} className="mt-0.5 shrink-0 text-warn" aria-label="Not yet" />}
                  <div>
                    <div className={r.ok ? 'text-ink' : 'text-warn'}>{r.label}</div>
                    <div className="text-[11px] text-muted">{r.detail}</div>
                    {!r.ok && (
                      <div className="mt-0.5 text-[11px] text-muted" data-testid="verify-help">
                        <span className="text-faint">Why: </span>
                        {r.why} <span className="text-faint">Where: </span>
                        {r.where} <span className="text-faint">Then click "Check my robot" again.</span>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {step.verify.manualPrompt && (
            <label className="mt-2 flex items-start gap-2 text-muted">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={record.manualConfirmed}
                onChange={(e) => {
                  setManualConfirmed(tutorial, projectId, index, e.target.checked);
                  if (step.verify.checks.length === 0 || record.results.length > 0) verifyStep(tutorial, projectId, index, ctx);
                }}
                data-testid="manual-check"
              />
              <span>
                <Badge className="mr-1">Manual check</Badge>
                {step.verify.manualPrompt}
              </span>
            </label>
          )}
          <p className="mt-2 flex items-center gap-1.5 text-[11px]" data-testid="step-status" data-status={record.status}>
            {record.status === 'passed' ? (
              <>
                <CheckCircle2 size={12} className="text-ok" aria-hidden /> Step complete
              </>
            ) : record.status === 'skipped' ? (
              <>
                <CircleDashed size={12} aria-hidden /> Skipped (optional)
              </>
            ) : record.status === 'failed' ? (
              <>
                <CircleAlert size={12} className="text-warn" aria-hidden /> Not complete yet
              </>
            ) : (
              <>
                <Circle size={12} aria-hidden /> Not checked yet
              </>
            )}
          </p>
        </section>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 border-t border-line p-2">
        <Button size="sm" variant="ghost" icon={<ChevronLeft size={13} />} disabled={index === 0} onClick={() => goToStep(tutorial, projectId, index - 1)} data-testid="tutorial-prev">
          Back
        </Button>
        {step.optional && record.status !== 'passed' && (
          <Button size="sm" variant="ghost" icon={<SkipForward size={13} />} onClick={() => skipStep(tutorial, projectId, index)} data-testid="tutorial-skip">
            Skip
          </Button>
        )}
        <Button size="sm" variant={record.status === 'passed' ? 'primary' : 'secondary'} icon={<ChevronRight size={13} />} disabled={index >= tutorial.steps.length - 1} onClick={() => goToStep(tutorial, projectId, index + 1)} data-testid="tutorial-next">
          Next
        </Button>
        <span className="flex-1" />
        <Button size="sm" variant="ghost" icon={<Pause size={13} />} onClick={() => useLearningSession.getState().setPanelOpen(false)} title="Hide the tutorial. Your progress is saved; reopen it with the Tutorial button." data-testid="tutorial-pause">
          Pause
        </Button>
        <Button size="sm" variant="ghost" icon={<RotateCcw size={13} />} onClick={() => setRestartOpen(true)} data-testid="tutorial-restart">
          Restart
        </Button>
      </div>
      <Modal
        open={restartOpen}
        title="Restart the tutorial?"
        onClose={() => setRestartOpen(false)}
        footer={
          <>
            <Button onClick={() => setRestartOpen(false)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => {
                restartTutorial(tutorial, projectId);
                setRestartOpen(false);
              }}
              data-testid="confirm-restart"
            >
              Restart
            </Button>
          </>
        }
      >
        <p className="text-[13px] text-muted">All tutorial steps go back to "not checked". Your robot, programs and environments are not changed.</p>
      </Modal>
    </div>
  );
}

function CompletionSummary({ tutorial, projectId }: { tutorial: TutorialDefinition; projectId: string }) {
  const def = definitionForTutorial(tutorial)!;
  const progress = useLearningStore((s) => s.progress[progressKey(tutorial.id, projectId)])!;
  const summary = summarize(tutorial, progress, physicalSummary(def).label);
  return (
    <section className="rounded-md border border-ok/40 bg-ok/10 p-3" data-testid="tutorial-complete" aria-label="Tutorial complete">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold text-ok">
        <CheckCircle2 size={15} aria-hidden /> {def.name}: tutorial complete
      </h2>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-[11.5px]">
        <dt className="text-faint">Objectives</dt>
        <dd className="text-muted">{def.learningObjectives.join(' · ')}</dd>
        <dt className="text-faint">Verified by the app</dt>
        <dd className="text-muted" data-testid="summary-verified">{summary.verifiedStages.join(', ') || '—'}</dd>
        <dt className="text-faint">Manual only</dt>
        <dd className="text-muted">{summary.manualStages.join(', ') || '—'}</dd>
        {summary.skippedStages.length > 0 && (
          <>
            <dt className="text-faint">Skipped</dt>
            <dd className="text-muted">{summary.skippedStages.join(', ')}</dd>
          </>
        )}
        <dt className="text-faint">Simulation</dt>
        <dd className="text-muted">{summary.simulation === 'run recorded' ? 'A completed program run was recorded.' : 'No completed run recorded.'}</dd>
        <dt className="text-faint">Physical build</dt>
        <dd className="text-muted">{summary.physical}. Not built or tested by AutoBotAI.</dd>
        <dt className="text-faint">Next</dt>
        <dd className="text-muted">{summary.next}</dd>
      </dl>
      <Link to="/library" className="mt-2 inline-block text-[11.5px] text-accent hover:underline">
        Choose the next project
      </Link>
    </section>
  );
}
