import type { SceneObject, SceneObjectDraft } from '../../types/scene';
import { createId } from '../../utils/id';

/** Turn a draft (from a template or the component catalog) into a scene object. */
export function materializeObject(draft: SceneObjectDraft, now = new Date().toISOString()): SceneObject {
  return {
    id: createId('obj'),
    name: draft.name,
    category: draft.category,
    geometry: structuredClone(draft.geometry),
    color: draft.color,
    transform: structuredClone(draft.transform),
    visible: true,
    parentId: null,
    metadata: {
      componentId: draft.componentId ?? null,
      description: draft.description ?? '',
      createdAt: now,
    },
  };
}
