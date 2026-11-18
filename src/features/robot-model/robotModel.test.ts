import { describe, expect, it } from 'vitest';
import type { SceneObject, Vec3 } from '../../types/scene';
import { materializeObject, materializeTemplate } from '../projects/materialize';
import { ALL_TEMPLATES, findTemplate } from '../robot-library/templates';
import { descendantIds, flattenTree, reparentError, validParentIds } from './hierarchy';
import { validateJoint } from './joints';
import { createJoint, deleteJoint, removeComponent, reparentComponent, updateJoint, type Model } from './operations';
import { indexObjects, worldPosition } from './transforms';
import { validateComponentDraft, validateRobotModel } from './validation';

function part(name: string, position: Vec3, parentId: string | null = null, extra: Partial<SceneObject> = {}): SceneObject {
  const o = materializeObject({
    name,
    category: 'body',
    geometry: { shape: 'box', size: [0.1, 0.1, 0.1] },
    color: '#64748B',
    transform: { position, rotation: [0, 0, 0], scale: [1, 1, 1] },
  });
  return { ...o, id: name, parentId, ...extra };
}

const close = (a: Vec3, b: Vec3) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, 9));

/** chassis (1,0,0) → wheel (local 0,0,0.2) → hub (local 0.05,0,0) ; arm at root */
function sample(): Model {
  return {
    objects: [part('chassis', [1, 0, 0]), part('wheel', [0, 0, 0.2], 'chassis'), part('hub', [0.05, 0, 0], 'wheel'), part('arm', [0, 1, 0])],
    joints: [],
  };
}

describe('hierarchy and world transforms', () => {
  it('derives world positions from the parent chain', () => {
    const index = indexObjects(sample().objects);
    close(worldPosition('hub', index), [1.05, 0, 0.2]);
  });

  it('moves children with their parent while their local transforms stay the same', () => {
    const m = sample();
    const moved = m.objects.map((o) => (o.id === 'chassis' ? { ...o, transform: { ...o.transform, position: [3, 0, 0] as Vec3 } } : o));
    const index = indexObjects(moved);
    close(worldPosition('wheel', index), [3, 0, 0.2]);
    close(worldPosition('hub', index), [3.05, 0, 0.2]);
    expect(moved.find((o) => o.id === 'wheel')!.transform.position).toEqual([0, 0, 0.2]);
  });

  it('applies parent rotation to children', () => {
    const objects = [
      part('base', [0, 0, 0], null, { transform: { position: [0, 0, 0], rotation: [0, Math.PI / 2, 0], scale: [1, 1, 1] } }),
      part('tip', [1, 0, 0], 'base'),
    ];
    close(worldPosition('tip', indexObjects(objects)), [0, 0, -1]);
  });

  it('prevents self-parenting and loops', () => {
    const { objects } = sample();
    expect(reparentError(objects, 'chassis', 'chassis')).toMatch(/own parent/);
    expect(reparentError(objects, 'chassis', 'hub')).toMatch(/loop/);
    expect(reparentError(objects, 'hub', 'arm')).toBeNull();
    expect(validParentIds(objects, 'chassis').sort()).toEqual(['arm']);
    expect([...descendantIds(objects, 'chassis')].sort()).toEqual(['hub', 'wheel']);
  });

  it('reparents while preserving the world position', () => {
    const result = reparentComponent(sample(), 'hub', 'arm');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const index = indexObjects(result.model.objects);
    close(worldPosition('hub', index), [1.05, 0, 0.2]);
    expect(result.model.objects.find((o) => o.id === 'hub')!.parentId).toBe('arm');
    close(result.model.objects.find((o) => o.id === 'hub')!.transform.position, [1.05, -1, 0.2]);
  });

  it('rejects a reparent that would create a loop and changes nothing', () => {
    const m = sample();
    const result = reparentComponent(m, 'chassis', 'wheel');
    expect(result.ok).toBe(false);
  });

  it('lists the tree parents-first with depth', () => {
    expect(flattenTree(sample().objects)).toEqual([
      { id: 'chassis', depth: 0 },
      { id: 'wheel', depth: 1 },
      { id: 'hub', depth: 2 },
      { id: 'arm', depth: 0 },
    ]);
  });
});

describe('deleting components keeps the hierarchy valid', () => {
  it('moves children up to the grandparent at the same world position and removes joints', () => {
    let m = sample();
    const joined = createJoint(m, { type: 'revolute', parentId: 'chassis', childId: 'wheel' });
    expect(joined.ok).toBe(true);
    if (!joined.ok) return;
    m = joined.model;
    const result = removeComponent(m, 'wheel');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.reparented).toEqual(['hub']);
    expect(result.removedJoints).toHaveLength(1);
    const hub = result.model.objects.find((o) => o.id === 'hub')!;
    expect(hub.parentId).toBe('chassis');
    close(worldPosition('hub', indexObjects(result.model.objects)), [1.05, 0, 0.2]);
    expect(validateRobotModel(result.model.objects, result.model.joints)).toEqual([]);
  });
});

describe('joints', () => {
  it('creates a joint and attaches the child to the parent if needed', () => {
    const result = createJoint(sample(), { type: 'fixed', parentId: 'arm', childId: 'chassis' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.reparented).toBe(true);
    expect(result.model.objects.find((o) => o.id === 'chassis')!.parentId).toBe('arm');
    close(worldPosition('chassis', indexObjects(result.model.objects)), [1, 0, 0]);
    expect(result.joint.origin.position).toEqual(result.model.objects.find((o) => o.id === 'chassis')!.transform.position);
  });

  it('validates joints', () => {
    const { objects } = sample();
    const base = { parentId: 'chassis', childId: 'wheel', axis: [0, 0, 1] as Vec3, limits: { lower: -1, upper: 1 }, origin: { position: [0, 0, 0] as Vec3, rotation: [0, 0, 0] as Vec3 } };
    expect(validateJoint({ ...base, type: 'revolute' }, objects, [])).toEqual([]);
    expect(validateJoint({ ...base, type: 'revolute', childId: 'chassis' }, objects, [])).toContain('A joint must connect two different components.');
    expect(validateJoint({ ...base, type: 'revolute', axis: [0, 0, 0] }, objects, [])).toContain('Joint axis must be a non-zero vector.');
    expect(validateJoint({ ...base, type: 'prismatic', limits: { lower: 1, upper: 0 } }, objects, [])).toContain('Lower limit must not be greater than the upper limit.');
    expect(validateJoint({ ...base, type: 'fixed', limits: { lower: 1, upper: 0 } }, objects, [])).toEqual([]);
    expect(validateJoint({ ...base, type: 'revolute', parentId: 'missing' }, objects, [])).toContain('Parent component not found.');
  });

  it('allows only one joint per child', () => {
    const first = createJoint(sample(), { type: 'revolute', parentId: 'chassis', childId: 'wheel' });
    if (!first.ok) throw new Error('setup');
    const second = createJoint(first.model, { type: 'fixed', parentId: 'chassis', childId: 'wheel' });
    expect(second.ok).toBe(false);
  });

  it('refuses to move a jointed child to another parent', () => {
    const first = createJoint(sample(), { type: 'revolute', parentId: 'chassis', childId: 'wheel' });
    if (!first.ok) throw new Error('setup');
    const moved = reparentComponent(first.model, 'wheel', 'arm');
    expect(moved.ok).toBe(false);
    if (!moved.ok) expect(moved.errors[0]).toMatch(/Delete the joint/);
  });

  it('edits joint properties with validation and normalizes the axis', () => {
    const first = createJoint(sample(), { type: 'revolute', parentId: 'chassis', childId: 'wheel' });
    if (!first.ok) throw new Error('setup');
    const id = first.joint.id;
    const axis = updateJoint(first.model, id, { axis: [0, 2, 0] });
    expect(axis.ok && axis.joint.axis).toEqual([0, 1, 0]);
    expect(updateJoint(first.model, id, { limits: { lower: 2, upper: 1 } }).ok).toBe(false);
    expect(updateJoint(first.model, id, { axis: [0, 0, 0] }).ok).toBe(false);
    const typed = updateJoint(first.model, id, { type: 'prismatic', limits: { lower: 0, upper: 0.2 } });
    expect(typed.ok && typed.changed.sort()).toEqual(['limits', 'type']);
    const removed = deleteJoint(first.model, id);
    expect(removed.ok && removed.model.joints).toEqual([]);
  });
});

describe('component validation', () => {
  it('rejects bad component data', () => {
    const good = { name: 'Box', category: 'body' as const, geometry: { shape: 'box' as const, size: [0.1, 0.1, 0.1] as Vec3 }, color: '#64748B', transform: { position: [0, 0, 0] as Vec3, rotation: [0, 0, 0] as Vec3, scale: [1, 1, 1] as Vec3 } };
    expect(validateComponentDraft(good)).toEqual([]);
    expect(validateComponentDraft({ ...good, geometry: { shape: 'box', size: [0, 0.1, 0.1] } })).not.toEqual([]);
    expect(validateComponentDraft({ ...good, color: 'red' })).not.toEqual([]);
    expect(validateComponentDraft({ ...good, transform: { ...good.transform, scale: [1, 0, 1] } })).not.toEqual([]);
    expect(validateComponentDraft({ ...good, transform: { ...good.transform, position: [Number.NaN, 0, 0] } })).not.toEqual([]);
  });
});

describe('templates with hierarchy and joints', () => {
  it('every template produces a valid model whose world positions match the template', () => {
    for (const template of ALL_TEMPLATES) {
      const drafts = template.build();
      const { objects, joints } = materializeTemplate(drafts, template.joints?.() ?? []);
      expect(validateRobotModel(objects, joints)).toEqual([]);
      const index = indexObjects(objects);
      objects.forEach((o, i) => close(worldPosition(o.id, index), drafts[i]!.transform.position));
    }
  });

  it('Explorer Bot is a tree under its chassis with wheel and sensor joints', () => {
    const t = findTemplate('explorer-bot')!;
    const { objects, joints } = materializeTemplate(t.build(), t.joints!());
    const chassis = objects.find((o) => o.name === 'Chassis')!;
    expect(chassis.parentId).toBeNull();
    expect(objects.filter((o) => o.parentId === chassis.id).map((o) => o.name)).toContain('Left Wheel');
    expect(objects.find((o) => o.name === 'Controller Board')!.parentId).toBe(objects.find((o) => o.name === 'Top Plate')!.id);
    expect(joints.map((j) => `${j.type}:${j.name}`)).toEqual(['revolute:Left Wheel Joint', 'revolute:Right Wheel Joint', 'fixed:Sensor Mount']);
  });
});
