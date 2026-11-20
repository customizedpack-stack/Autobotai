/**
 * Tutorial sequencing: Learn → Do → Verify, with persisted progress.
 * Pure helpers work on TutorialProgress values; the store wrappers persist them.
 */
import type { CheckResult, StepRecord, TutorialDefinition, TutorialProgress, TutorialStep } from '../model/types';
import { progressKey, useLearningStore } from '../store/learningStore';
import { isStepDone, isTutorialComplete, recordOf } from './progress';

export { isStepDone, isTutorialComplete, recordOf, summarize, type TutorialSummary } from './progress';
import { runChecks, type CheckContext } from './checks';

/** Evaluate one step against the real project state. Pure apart from reading stores through the checks. */
export function evaluateStep(step: TutorialStep, previous: StepRecord, ctx: CheckContext, now = new Date().toISOString()): StepRecord {
  const results: CheckResult[] = runChecks(step.verify.checks, ctx);
  const checksOk = results.every((r) => r.ok);
  const manualOk = step.verify.manualPrompt === null || previous.manualConfirmed;
  return { status: checksOk && manualOk ? 'passed' : 'failed', results, checkedAt: now, manualConfirmed: previous.manualConfirmed };
}

export function applyRecord(progress: TutorialProgress, tutorial: TutorialDefinition, step: TutorialStep, record: StepRecord): TutorialProgress {
  const steps = { ...progress.steps, [step.id]: record };
  const next: TutorialProgress = { ...progress, steps };
  const completed = tutorial.steps.filter((s) => isStepDone(next, s)).map((s) => s.id);
  const done = isTutorialComplete(tutorial, { ...next, completed });
  return { ...next, completed, completedAt: done ? (progress.completedAt ?? new Date().toISOString()) : null };
}

// ── Store wrappers ──

export function startTutorial(tutorial: TutorialDefinition, projectId: string): TutorialProgress {
  return useLearningStore.getState().startProgress(tutorial.id, projectId, tutorial.version);
}

export function getProgress(tutorial: TutorialDefinition, projectId: string): TutorialProgress | undefined {
  return useLearningStore.getState().progress[progressKey(tutorial.id, projectId)];
}

export function verifyStep(tutorial: TutorialDefinition, projectId: string, index: number, ctx: CheckContext): StepRecord | null {
  const key = progressKey(tutorial.id, projectId);
  const progress = useLearningStore.getState().progress[key];
  const step = tutorial.steps[index];
  if (!progress || !step) return null;
  const record = evaluateStep(step, recordOf(progress, step.id), ctx);
  useLearningStore.getState().updateProgress(key, (p) => applyRecord(p, tutorial, step, record));
  return record;
}

/** The user ticks the "Manual check" box. Never set by code on its own. */
export function setManualConfirmed(tutorial: TutorialDefinition, projectId: string, index: number, confirmed: boolean): void {
  const key = progressKey(tutorial.id, projectId);
  const step = tutorial.steps[index];
  if (!step || step.verify.manualPrompt === null) return;
  useLearningStore.getState().updateProgress(key, (p) => {
    const prev = recordOf(p, step.id);
    // Un-confirming reopens a passed step.
    const record: StepRecord = { ...prev, manualConfirmed: confirmed, status: !confirmed && prev.status === 'passed' ? 'pending' : prev.status };
    return applyRecord(p, tutorial, step, record);
  });
}

export function skipStep(tutorial: TutorialDefinition, projectId: string, index: number): boolean {
  const step = tutorial.steps[index];
  if (!step?.optional) return false;
  const key = progressKey(tutorial.id, projectId);
  useLearningStore.getState().updateProgress(key, (p) => applyRecord(p, tutorial, step, { ...recordOf(p, step.id), status: 'skipped' }));
  goToStep(tutorial, projectId, index + 1);
  return true;
}

export function goToStep(tutorial: TutorialDefinition, projectId: string, index: number): void {
  const clamped = Math.max(0, Math.min(tutorial.steps.length - 1, index));
  useLearningStore.getState().updateProgress(progressKey(tutorial.id, projectId), (p) => ({ ...p, currentStep: clamped }));
}

export function restartTutorial(tutorial: TutorialDefinition, projectId: string): void {
  useLearningStore.getState().restartProgress(progressKey(tutorial.id, projectId));
}

