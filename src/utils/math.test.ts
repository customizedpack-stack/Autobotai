import { describe, expect, it } from 'vitest';
import { cameraPosition, framingDistance, viewDirection } from '../features/viewport/cameraPresets';
import { ALL_TEMPLATES } from '../features/robot-library/templates';
import { materializeObject } from '../features/projects/materialize';
import { sceneBounds } from './math';

describe('camera presets', () => {
  it('returns unit directions for every view', () => {
    for (const view of ['perspective', 'front', 'back', 'left', 'right', 'top'] as const) {
      const [x, y, z] = viewDirection(view);
      expect(Math.hypot(x, y, z)).toBeCloseTo(1);
    }
  });

  it('places the front camera on +Z and the top camera above the target', () => {
    expect(cameraPosition([0, 0, 0], 'front', 5)).toEqual([0, 0, 5]);
    const top = cameraPosition([0, 1, 0], 'top', 4);
    expect(top[1]).toBeCloseTo(5);
  });

  it('frames larger objects from further away', () => {
    expect(framingDistance(2, 45)).toBeGreaterThan(framingDistance(0.5, 45));
  });
});

describe('templates', () => {
  it('builds valid objects for every template', () => {
    for (const template of ALL_TEMPLATES) {
      const objects = template.build().map((d) => materializeObject(d));
      expect(objects.length).toBeGreaterThan(0);
      const bounds = sceneBounds(objects);
      expect(Number.isFinite(bounds.radius)).toBe(true);
      expect(bounds.radius).toBeGreaterThan(0);
    }
  });
});
