# Robot Configuration Schema v2

Status: current since Phase 2. Types: `src/types/project.ts`, `src/types/scene.ts`, `src/types/joint.ts`. Migration: `src/features/robot-model/schema.ts`.

## Shape

```ts
RobotProject {
  id, name, category, templateId,
  schemaVersion: 2,
  objects: SceneObject[],      // components
  joints: RobotJoint[],        // NEW in v2
  createdAt, updatedAt, savedAt,
}

SceneObject {
  id, name, category, geometry, color, visible,
  parentId: string | null,     // v2: real hierarchy (v1: always null)
  transform: { position, rotation, scale },   // v2: LOCAL to the parent (v1: world)
  metadata: { componentId, description, createdAt },
}

RobotJoint {
  id, name, type: 'fixed' | 'revolute' | 'prismatic',
  parentId, childId,
  axis: [x, y, z],                              // unit vector, joint frame
  origin: { position, rotation },               // in the parent's frame
  limits: { lower, upper },                     // rad (revolute) or m (prismatic)
  metadata: { description, createdAt },
}
```

Children are derived from `parentId`, never stored twice. World transforms are derived (`features/robot-model/transforms.ts`).

## v1 → v2 migration

- Every v1 object has `parentId: null`, so its world transform **is** its local transform. Transforms are kept exactly as they were.
- `joints: []` is added and `schemaVersion` becomes 2.
- Missing fields get safe defaults (for example a missing transform becomes the origin) and are reported as warnings in the console.
- Unknown extra fields are kept.
- A stored entry that is not an object at all is not loaded, but its raw data is copied to the `arai.projects.unreadable` key in browser storage and an error is logged. Nothing is silently discarded.
- The browser store key keeps its name (`arai.projects.v1`); the store's internal version moved from 1 to 2 and runs the migration automatically when a Phase 1 draft is found.

Tests: `src/features/robot-model/schema.test.ts` (unit) and the "Phase 1 (schema v1) project still opens" step in `tests/e2e/builder.e2e.mjs` (browser).
