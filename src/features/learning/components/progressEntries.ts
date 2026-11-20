import { useProjectStore } from '../../../stores/projectStore';
import { TUTORIALS } from '../catalog/tutorials';
import { isStepDone } from '../engine/progress';
import { useLearningStore } from '../store/learningStore';
import type { TutorialDefinition, TutorialProgress } from '../model/types';

export interface ProgressEntry {
  tutorial: TutorialDefinition;
  progress: TutorialProgress;
  projectName: string;
  done: number;
}

/** Tutorial progress for projects that still exist, newest first. */
export function useProgressEntries(): ProgressEntry[] {
  const progress = useLearningStore((s) => s.progress);
  const projects = useProjectStore((s) => s.projects);
  return Object.values(progress)
    .map((p) => {
      const tutorial = TUTORIALS.find((t) => t.id === p.tutorialId);
      const project = projects[p.projectId];
      if (!tutorial || !project) return null;
      return { tutorial, progress: p, projectName: project.name, done: tutorial.steps.filter((s) => isStepDone(p, s)).length };
    })
    .filter((e): e is ProgressEntry => e !== null)
    .sort((a, b) => b.progress.updatedAt.localeCompare(a.progress.updatedAt));
}

export const tutorialHref = (tutorialId: string, projectId: string) => `/workspace/${projectId}?tutorial=${encodeURIComponent(tutorialId)}`;

