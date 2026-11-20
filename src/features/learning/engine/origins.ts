import { useProjectStore } from '../../../stores/projectStore';
import type { RobotProject } from '../../../types/project';
import { useLearningStore, type OriginKind } from '../store/learningStore';

/** Projects the user already made from this library entry (newest first). Missing projects are skipped. */
export function projectsFromDefinition(definitionId: string, kind?: OriginKind): RobotProject[] {
  const origins = useLearningStore.getState().origins;
  const projects = useProjectStore.getState().projects;
  return Object.entries(origins)
    .filter(([id, o]) => o.definitionId === definitionId && (!kind || o.kind === kind) && projects[id])
    .map(([id]) => projects[id]!)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
