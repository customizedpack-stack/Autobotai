import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeStorage } from '../../../utils/storage';
import type { StepRecord, TutorialProgress } from '../model/types';

/**
 * Phase 11 learning data, kept apart from projects (arai.learning.v1).
 * It stores ids, step states and verification results only — never a copy of a robot.
 */

export type OriginKind = 'robot' | 'example' | 'tutorial';

export interface ProjectOrigin {
  definitionId: string;
  definitionVersion: number;
  kind: OriginKind;
  createdAt: string;
}

/** Evidence of real runs, recorded from bus events (see engine/evidence.ts). */
export interface RunEvidence {
  programId: string;
  completedAt: string;
  physics: boolean;
}

export const progressKey = (tutorialId: string, projectId: string) => `${tutorialId}::${projectId}`;

interface LearningState {
  origins: Record<string, ProjectOrigin>;
  progress: Record<string, TutorialProgress>;
  runs: Record<string, RunEvidence[]>;
  setOrigin: (projectId: string, origin: ProjectOrigin) => void;
  startProgress: (tutorialId: string, projectId: string, version: number) => TutorialProgress;
  updateProgress: (key: string, patch: (p: TutorialProgress) => TutorialProgress) => void;
  restartProgress: (key: string) => void;
  recordRun: (projectId: string, run: RunEvidence) => void;
  forgetProject: (projectId: string) => void;
}

const MAX_RUNS = 20;

export const useLearningStore = create<LearningState>()(
  persist(
    (set, get) => ({
      origins: {},
      progress: {},
      runs: {},
      setOrigin: (projectId, origin) => set((s) => ({ origins: { ...s.origins, [projectId]: origin } })),
      startProgress: (tutorialId, projectId, version) => {
        const key = progressKey(tutorialId, projectId);
        const existing = get().progress[key];
        if (existing && existing.tutorialVersion === version) return existing;
        const now = new Date().toISOString();
        const fresh: TutorialProgress = { tutorialId, projectId, tutorialVersion: version, currentStep: 0, completed: [], steps: {}, startedAt: now, updatedAt: now, completedAt: null };
        set((s) => ({ progress: { ...s.progress, [key]: fresh } }));
        return fresh;
      },
      updateProgress: (key, patch) => {
        const existing = get().progress[key];
        if (!existing) return;
        set((s) => ({ progress: { ...s.progress, [key]: { ...patch(existing), updatedAt: new Date().toISOString() } } }));
      },
      restartProgress: (key) => {
        const existing = get().progress[key];
        if (!existing) return;
        const now = new Date().toISOString();
        set((s) => ({ progress: { ...s.progress, [key]: { ...existing, currentStep: 0, completed: [], steps: {}, startedAt: now, updatedAt: now, completedAt: null } } }));
      },
      recordRun: (projectId, run) => set((s) => ({ runs: { ...s.runs, [projectId]: [...(s.runs[projectId] ?? []), run].slice(-MAX_RUNS) } })),
      forgetProject: (projectId) =>
        set((s) => {
          const origins = { ...s.origins };
          delete origins[projectId];
          const runs = { ...s.runs };
          delete runs[projectId];
          const progress = Object.fromEntries(Object.entries(s.progress).filter(([, p]) => p.projectId !== projectId));
          return { origins, runs, progress };
        }),
    }),
    { name: 'arai.learning.v1', storage: safeStorage, version: 1 },
  ),
);

export function emptyRecord(): StepRecord {
  return { status: 'pending', results: [], checkedAt: null, manualConfirmed: false };
}
