# Robot Builder (Phase 2, active)

Builder-specific rules that are not tied to the UI:

- `placement.ts` — where a component dropped from the library lands: resting on the picked surface (ground or a part), attached to the part it was dropped on, returned as a world pose that the C1 connector converts into the parent frame.

Related modules:

- `features/robot-model/` — hierarchy, transforms, joints, validation, schema and the C1 Robot Model Connector.
- `features/viewport/TransformGizmo.tsx` — move / rotate / scale gizmo (edits the same local transform as the inspector).
- `components/workspace/ObjectsPanel.tsx` — component tree with drag-to-reparent.
- `features/inspector/JointInspector.tsx`, `JointDialog.tsx` — joint editing.
