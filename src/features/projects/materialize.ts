import type { JointDraft, RobotJoint } from '../../types/joint';
import type { SceneObject, SceneObjectDraft } from '../../types/scene';
import { createId } from '../../utils/id';
import { buildJoint } from '../robot-model/joints';
import { invert, multiply, transformPoint, type Mat4 } from '../robot-model/mat4';
import { matrixToTransform, transformToMatrix } from '../robot-model/transforms';

/** Turn a draft (from a template or the component catalog) into a scene object (a root by default). */
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

/**
 * Materialize a template: drafts carry WORLD transforms plus optional
 * `key` / `parentKey`; joints refer to keys. The result has real ids, parent
 * links, LOCAL transforms and joints whose origin is in the parent frame.
 */
export function materializeTemplate(
  drafts: SceneObjectDraft[],
  jointDrafts: JointDraft[] = [],
  now = new Date().toISOString(),
): { objects: SceneObject[]; joints: RobotJoint[] } {
  const keyToId = new Map<string, string>();
  const worldByKey = new Map<string, Mat4>();
  const created = drafts.map((draft) => {
    const object = materializeObject(draft, now);
    if (draft.key) {
      keyToId.set(draft.key, object.id);
      worldByKey.set(draft.key, transformToMatrix(draft.transform));
    }
    return { draft, object };
  });

  const objects = created.map(({ draft, object }) => {
    const parentWorld = draft.parentKey ? worldByKey.get(draft.parentKey) : undefined;
    const parentId = draft.parentKey ? keyToId.get(draft.parentKey) : undefined;
    if (!parentWorld || !parentId) return object;
    const local = multiply(invert(parentWorld), transformToMatrix(draft.transform));
    return { ...object, parentId, transform: matrixToTransform(local) };
  });

  const byId = new Map(objects.map((o) => [o.id, o]));
  const joints: RobotJoint[] = [];
  for (const jd of jointDrafts) {
    const parentId = keyToId.get(jd.parentKey);
    const childId = keyToId.get(jd.childKey);
    const parentWorld = worldByKey.get(jd.parentKey);
    if (!parentId || !childId || !parentWorld) continue;
    const child = byId.get(childId);
    let position = child ? [...child.transform.position] : [0, 0, 0];
    if (jd.originWorld) {
      position = transformPoint(invert(parentWorld), jd.originWorld).map((v) => Number(v.toPrecision(12)));
    }
    joints.push(
      buildJoint(
        {
          name: jd.name,
          type: jd.type,
          parentId,
          childId,
          axis: jd.axis,
          limits: jd.limits,
          origin: { position: position as [number, number, number], rotation: [0, 0, 0] },
          description: jd.description,
        },
        child,
        byId.get(parentId)?.name ?? 'parent',
        now,
      ),
    );
  }
  return { objects, joints };
}
