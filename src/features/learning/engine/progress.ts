/** Progress helpers with no store or check imports (safe for dashboard pages). */
import type { StepRecord, TutorialDefinition, TutorialProgress, TutorialStep } from '../model/types';
import { emptyRecord } from '../store/learningStore';

export function recordOf(progress: TutorialProgress, stepId: string): StepRecord {
  return progress.steps[stepId] ?? emptyRecord();
}

/** A step is done when it passed (checks + manual confirmation) or was skipped (optional only). */
export function isStepDone(progress: TutorialProgress, step: TutorialStep): boolean {
  const r = recordOf(progress, step.id);
  return r.status === 'passed' || (step.optional && r.status === 'skipped');
}

export function isTutorialComplete(tutorial: TutorialDefinition, progress: TutorialProgress): boolean {
  return tutorial.steps.every((s) => isStepDone(progress, s) || (s.optional && recordOf(progress, s.id).status === 'skipped'));
}

// ── Completion summary ──

export interface TutorialSummary {
  verifiedStages: string[];
  manualStages: string[];
  skippedStages: string[];
  openStages: string[];
  simulation: 'run recorded' | 'not run';
  physical: string;
  next: string;
}

export function summarize(tutorial: TutorialDefinition, progress: TutorialProgress, physicalStatus: string): TutorialSummary {
  const verifiedStages: string[] = [];
  const manualStages: string[] = [];
  const skippedStages: string[] = [];
  const openStages: string[] = [];
  for (const step of tutorial.steps) {
    const r = recordOf(progress, step.id);
    if (r.status === 'skipped') skippedStages.push(step.title);
    else if (r.status !== 'passed') openStages.push(step.title);
    else if (step.verify.checks.length > 0) verifiedStages.push(step.title);
    else manualStages.push(step.title);
  }
  const sim = tutorial.steps.find((s) => s.stage === 'simulation');
  const simulation = sim && recordOf(progress, sim.id).status === 'passed' ? 'run recorded' : 'not run';
  const next = openStages.length > 0 ? `Finish "${openStages[0]}".` : 'Change the program and run it again, or try the next project in the library.';
  return { verifiedStages, manualStages, skippedStages, openStages, simulation, physical: physicalStatus, next };
}
