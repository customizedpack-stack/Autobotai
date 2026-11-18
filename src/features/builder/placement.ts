import type { SceneObject, SceneObjectDraft, Transform, Vec3 } from '../../types/scene';
import { restingHeight } from '../../utils/math';
import type { ComponentDefinition } from '../component-library/catalog';


/** Result of picking a point in the viewport. Normal is in world space. */
export interface PickHit {
  point: Vec3;
  normal: Vec3;
  /** Component under the pointer, or null for the ground plane. */
  objectId: string | null;
}

/** Half-extent of a component along its local up axis after its default rotation. */
export function componentRestOffset(component: ComponentDefinition): number {
  const rotation = component.rotation ?? [0, 0, 0];
  const lying = Math.abs(rotation[0]) > 1e-6 || Math.abs(rotation[2]) > 1e-6;
  if (lying && component.geometry.shape === 'cylinder') return component.geometry.radius;
  return restingHeight(component.geometry);
}

/** Draft for a catalog component with the given WORLD position. */
export function componentDraft(component: ComponentDefinition, position: Vec3): SceneObjectDraft {
  return {
    name: component.name,
    category: component.category,
    geometry: structuredClone(component.geometry),
    color: component.color,
    transform: { position, rotation: [...(component.rotation ?? [0, 0, 0])] as Vec3, scale: [1, 1, 1] },
    componentId: component.id,
    description: `${component.description} Placeholder primitive; becomes functional in ${component.functionalIn}.`,
  };
}

/**
 * Where a dropped component goes: resting on the picked surface, attached to
 * the component under the pointer (if any). The returned transform is WORLD.
 */
export function computeDropPlacement(
  component: ComponentDefinition,
  hit: PickHit,
  objects: readonly SceneObject[],
): { parentId: string | null; world: Transform } {
  const length = Math.hypot(...hit.normal);
  const normal: Vec3 = length < 1e-9 ? [0, 1, 0] : [hit.normal[0] / length, hit.normal[1] / length, hit.normal[2] / length];
  const offset = componentRestOffset(component);
  const position: Vec3 = [hit.point[0] + normal[0] * offset, hit.point[1] + normal[1] * offset, hit.point[2] + normal[2] * offset];
  const parentId = hit.objectId && objects.some((o) => o.id === hit.objectId) ? hit.objectId : null;
  const world: Transform = { position, rotation: [...(component.rotation ?? [0, 0, 0])] as Vec3, scale: [1, 1, 1] };
  return { parentId, world };
}
