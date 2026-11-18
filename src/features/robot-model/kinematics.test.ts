import { describe, expect, it } from 'vitest';
import type { RobotJoint } from '../../types/joint';
import type { SceneObject, Vec3 } from '../../types/scene';
import { materializeObject } from '../projects/materialize';
import { checkJointValue, neutralJointValue, posedChildTransform, wrapAngle } from './kinematics';

const close = (a: Vec3, b: Vec3) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, 9));

function child(position: Vec3): SceneObject {
  return materializeObject({
    name: 'Child',
    category: 'body',
    geometry: { shape: 'box', size: [0.1, 0.1, 0.1] },
    color: '#64748B',
    transform: { position, rotation: [0, 0, 0], scale: [1, 1, 1] },
  });
}

function joint(type: RobotJoint['type'], extra: Partial<RobotJoint> = {}): RobotJoint {
  return {
    id: 'j',
    name: 'J',
    type,
    parentId: 'p',
    childId: 'c',
    axis: [0, 0, 1],
    origin: { position: [0, 0, 0], rotation: [0, 0, 0] },
    limits: type === 'prismatic' ? { lower: 0, upper: 0.2 } : { lower: -Math.PI / 2, upper: Math.PI / 2 },
    metadata: { description: '', createdAt: '' },
    ...extra,
  };
}

describe('joint preview kinematics', () => {
  it('revolute: rotates the child around the joint origin and axis', () => {
    const c = child([1, 0, 0]);
    const posed = posedChildTransform(c, joint('revolute'), Math.PI / 2);
    close(posed.position, [0, 1, 0]);
    expect(posed.rotation[2]).toBeCloseTo(Math.PI / 2);
  });

  it('revolute around an offset origin: the point on the axis stays put', () => {
    const c = child([0.5, 0, 0]);
    const j = joint('revolute', { origin: { position: [0.5, 0, 0], rotation: [0, 0, 0] } });
    close(posedChildTransform(c, j, 1.2).position, [0.5, 0, 0]);
  });

  it('prismatic: slides the child along the axis', () => {
    const c = child([0, 0.1, 0]);
    const posed = posedChildTransform(c, joint('prismatic', { axis: [0, 1, 0] }), 0.15);
    close(posed.position, [0, 0.25, 0]);
    expect(posed.rotation).toEqual([0, 0, 0]);
  });

  it('keeps the stored child transform unchanged (the design pose)', () => {
    const c = child([1, 0, 0]);
    posedChildTransform(c, joint('revolute'), 1);
    expect(c.transform.position).toEqual([1, 0, 0]);
  });

  it('validates the lower limit', () => {
    const r = checkJointValue(joint('revolute'), -2);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/lower limit/);
  });

  it('validates the upper limit', () => {
    const r = checkJointValue(joint('prismatic'), 0.3);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/upper limit/);
    expect(checkJointValue(joint('prismatic'), 0.2)).toEqual({ ok: true, value: 0.2 });
    expect(checkJointValue(joint('revolute'), Number.NaN).ok).toBe(false);
  });

  it('fixed joints never move', () => {
    const r = checkJointValue(joint('fixed'), 0);
    expect(r.ok).toBe(false);
    const c = child([1, 0, 0]);
    expect(posedChildTransform(c, joint('fixed'), 1)).toBe(c.transform);
  });

  it('neutral is 0, or the nearest limit when 0 is outside the range', () => {
    expect(neutralJointValue(joint('revolute'))).toBe(0);
    expect(neutralJointValue(joint('prismatic', { limits: { lower: 0.05, upper: 0.2 } }))).toBe(0.05);
  });

  it('wraps continuous wheel angles', () => {
    expect(wrapAngle(Math.PI * 3)).toBeCloseTo(Math.PI);
    expect(wrapAngle(-Math.PI / 2 - 2 * Math.PI)).toBeCloseTo(-Math.PI / 2);
  });
});
