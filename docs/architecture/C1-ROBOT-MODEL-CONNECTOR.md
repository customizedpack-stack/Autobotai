# C1 — Robot Model Connector

Status: active since Phase 2. Source: `src/features/robot-model/robotModelConnector.ts`.

## Purpose

C1 is the single gateway for **structural** changes to a robot: adding and removing components, changing the component hierarchy, and creating, editing or deleting joints. It sits between the editor UI and the robot configuration (`sceneStore`), so every structural change is validated the same way, recorded as one undo step, and announced on the Connector Bus.

Plain transform edits (move, rotate, scale from the gizmo or the inspector) are not structural. They stay on `sceneStore.updateTransform` and the gizmo's transient-change API, and they emit `scene.changed`.

## How a command flows

```
UI / shortcut / bus request
        │
        ▼
robotModel.<command>()            ← src/features/robot-model/robotModelConnector.ts
        │  1. validate with pure functions (operations.ts, hierarchy.ts, joints.ts, validation.ts)
        │  2. on error: publish robotModel.rejected, log, change nothing
        ▼
sceneStore.applyModel(label, next)  ← one undo step in the existing history
        │
        ▼
bus.publish('robotModel.<event>', …) and bus.publish('robotModel.changed', …)
```

## Command API (TypeScript)

All commands return `CommandResult<T> = { ok: true; value: T } | { ok: false; errors: string[] }`.

| Command | What it does | Main validation |
| --- | --- | --- |
| `getModel()` | Read-only snapshot `{ objects, joints }` | — |
| `validate()` | Whole-model check, returns `ModelIssue[]` | duplicate ids, self-parent, loops, missing parents, joint consistency |
| `addComponent(draft, { parentId?, worldTransform? })` | Add a component, optionally attached to a parent; `worldTransform: true` converts a world pose (e.g. a drop point) into the parent frame | name, category, color, positive geometry, finite transform, non-zero scale, parent exists |
| `insertAssembly(objects, joints, label)` | Insert a ready-made assembly (starter robot) as one step | whole model must stay valid |
| `removeComponent(id)` | Remove a component. Its children move up to its parent **keeping their world pose**; joints that involve it are removed | component exists |
| `reparent(id, parentId \| null)` | Attach to another parent or detach to the top level, **keeping the world pose** | not itself, not one of its descendants (no loops), not jointed to its current parent |
| `createJoint(input)` | Create a joint; if the child is not yet attached to the joint parent it is attached in the same step (world pose kept) | different components, both exist, child has no other joint, no reverse joint, non-zero axis, finite origin, lower ≤ upper (not for fixed) |
| `updateJoint(id, patch)` | Edit name, type, axis (normalized), origin, limits | same rules as create; empty name refused; no-op edits ignored |
| `deleteJoint(id)` | Delete a joint; components and hierarchy stay | joint exists |

## Events (published after a change is applied)

| Channel | Payload |
| --- | --- |
| `robotModel.componentAdded` | `{ componentId, name, parentId }` |
| `robotModel.componentRemoved` | `{ componentId, name, reparentedChildren: string[], removedJoints: string[] }` |
| `robotModel.componentReparented` | `{ componentId, from, to }` |
| `robotModel.jointCreated` | `{ jointId, type, parentId, childId }` |
| `robotModel.jointUpdated` | `{ jointId, changed: string[] }` |
| `robotModel.jointDeleted` | `{ jointId, parentId, childId }` |
| `robotModel.rejected` | `{ command, errors: string[] }` — nothing changed |
| `robotModel.changed` | `{ reason, componentCount, jointCount }` — after every accepted change |

## Requests (any module may send these on the bus)

Handled by `connectRobotModelConnector()`, which runs once at start-up (`src/app/bootstrap.ts`). Each request calls the same command as the UI, with the same validation and events.

| Channel | Payload |
| --- | --- |
| `robotModel.request.reparent` | `{ componentId, parentId }` |
| `robotModel.request.removeComponent` | `{ componentId }` |
| `robotModel.request.createJoint` | `JointInput` (`type, parentId, childId, name?, axis?, origin?, limits?, description?`) |
| `robotModel.request.updateJoint` | `{ jointId, patch }` |
| `robotModel.request.deleteJoint` | `{ jointId }` |

Future users: Code Studio (Phase 4) and the AI layer (Phase J) can change a robot by sending these requests instead of touching stores.

## Joint conventions (URDF-like)

- A joint connects a **parent** component to a **child** component; the child is always a direct child of the parent in the hierarchy.
- `origin` is the joint frame in the **parent's local frame**; `axis` is a unit vector in the joint frame.
- Limits are radians for revolute joints and meters for prismatic joints; fixed joints ignore limits.
- A component has at most one joint to its parent, so joints form a tree, like URDF.
- Joints are stored and validated only. Motion under joint limits is simulated in Phase 5 (physics).
