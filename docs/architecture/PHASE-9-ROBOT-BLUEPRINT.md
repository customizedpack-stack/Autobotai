# Phase 9 — Real-World Robotics Blueprint: Architecture

This document has two parts. Part A is the architecture assessment that was written before any Phase 9 code. Part B describes what was built on top of that assessment.

## Part A — Architecture assessment (before coding)

### How the existing robot is represented

The project record (`RobotProject`, schema v3, browser key `arai.projects.v1`) holds the robot model. Phases 1 to 8 store it like this:

| Element | Where it lives | Notes |
|---|---|---|
| Parts | `objects: SceneObject[]` | A tree via `parentId`. Each part has a category (`chassis`, `body`, `wheel`, `motor`, `sensor`, `joint`, `other`), a primitive geometry in meters and an optional `physics` override (Phase 5). |
| Joints | `joints: RobotJoint[]` | They connect a parent part to a child part. |
| Motors | `actuators: RobotActuator[]` | Each actuator drives one joint. `componentId` points at the motor part. |
| Drive | `controllers: RobotController[]` | The differential drive (a logical controller, not hardware). |
| Sensors and cameras | optional `sensors: RobotSensor[]` | Distance, encoder and IMU (Phase 6). Cameras were added in Phase 8 and are mounted on a part through `partId`. |
| Environment | optional `environmentId` | Phase 7. Environments themselves live in `arai.environments.v1`. |
| Programs | `arai.programs.v1` | Separate from the project and keyed by `projectId`. |

The editable copy of the model is held in `sceneStore`. Every change goes through the C1 Robot Model Connector and `applyModel`, and each change is one undo step (a snapshot of the model, 100 steps). Saving only happens when the user clicks Save, through `saveCurrentProject` and then `projectStore.saveProject`. Loading old data runs `migrateProject`, which keeps fields it does not know about.

### Integration options considered

1. **Add parts to the robot model.** This was rejected. Real parts would become a second robot model, which the brief forbids, and they would change physics and the simulation.
2. **A separate store per project in its own browser key.** This was also rejected. It would need its own lifecycle and could get out of sync with Save, project deletion and reload.
3. **An optional `blueprint` field on the project, with its own store and undo history.** This option was chosen. The schema version stays 3, because old projects simply have no field, which is the same pattern Phase 6 used for sensors and Phase 7 used for `environmentId`. The blueprint is saved by the same explicit Save and deleted together with the project. Blueprint edits never touch the model's undo stack, and model undo never touches the blueprint.

### Decisions taken from the assessment

- **One robot model.** The blueprint only refers to model parts by id. Electronics that the 3D model does not show, such as the motor driver, battery or regulator, are blueprint-only *hardware items*. They are entries in the BOM and the wiring list, not 3D parts.
- **The catalog is independent.** It is a lazily loaded module and is not stored in projects. A mapping stores the part id plus a full snapshot of the part data, so a catalog update can never silently change a robot.
- **A new workspace mode, `blueprint`.** It uses the Code Studio layout: the pane sits beside the same viewport element, which is never remounted. The robot cannot drive (`canDrive` is false) and the design is locked (`isDesignLocked` is true). Undo and Redo work on the blueprint history while this mode is active.
- **History comes from bus events**, not from polling. Only discrete design events are recorded.

## Part B — What was built

### Modules (`src/features/blueprint/`)

| File | Role |
|---|---|
| `catalog/types.ts` | Part schema. Every spec is optional, and a missing spec means "Unknown". It also holds the verification level, the source with its date, and the verified price with its date. |
| `catalog/parts.ts` | The curated data. It has 14 parts and is loaded lazily as its own chunk (`parts-*.js`). |
| `catalog/catalog.ts` | Loads the catalog lazily. It also validates entries, rejects duplicates (by id, and by manufacturer plus part number), sanitizes links to https only, and provides search and the missing-spec list. |
| `model/types.ts` | Blueprint data: mappings, hardware items, BOM extras, wiring records, guide state, history and versions. |
| `model/normalize.ts` | The load-time migration. It is idempotent, drops invalid entries and counts them, and re-validates and re-sanitizes the part snapshots. |
| `engine/virtualComponents.ts` | The list of virtual components, the orphan mappings, and the virtual-vs-physical differences. |
| `engine/compatibility.ts` | Compatibility checks with four statuses. Missing data gives Unknown. |
| `engine/bom.ts` | The BOM, totals and CSV export. |
| `engine/wiring.ts` | Wiring validation and the "standard wires" helper. |
| `engine/guide.ts` | A Build Guide with 14 sections and stable step ids. |
| `engine/history.ts` | Compares two versions of the blueprint. |
| `blueprintStore.ts` | The open blueprint, its undo and redo (100 steps), the history log (1000 events) and versions (20). |
| `blueprintActions.ts` | The commands the UI calls. Each one is a single undo step plus history events. |
| `blueprintHistory.ts` | Records history from bus events. |
| `components/*` | The workspace pane (lazily loaded) and its 8 tabs. |

### Data model and migration

`RobotProject.blueprint?: Blueprint` holds the following:

```text
version: 1, createdAt
mappings[]   { id, targetKind: component|hardware, targetId, partId, snapshot, quantity, required, note, mappedAt, driverMappingId? }
hardware[]   { id, role, name }                       (blueprint-only electronics)
bomExtras[]  { id, name, quantity, required, note, partId|null, snapshot|null }
wiring[]     { id, controllerPin, componentRef, componentPin, interface, voltage|null, direction, sourceRef, notes }
guide        { generatedAt, steps: { [stepId]: { status, note, updatedAt } } }
bomGeneratedAt
history[]    { id, timestamp, type, component, previous, next, note }   (max 1000)
snapshots[]  { id, label, createdAt, data }                             (max 20)
```

The migration follows these rules:

- **No blueprint yet.** When a project has no `blueprint` field, an empty blueprint is created in memory. The field is only written once the user adds blueprint content and saves. Phase 1–8 projects therefore stay byte-identical until the user uses the Blueprint.
- **Validation and idempotence.** `normalizeBlueprint` validates every entry. It drops anything invalid, such as a snapshot that fails part validation, an unknown interface, a duplicate id, or a second mapping for the same component. Running it again on its own output returns an equal value; a unit test checks this.
- **Invalid catalog references.** If a mapped part is no longer in the catalog, the mapping keeps its snapshot and a catalog warning is shown. If the catalog data differs from the snapshot, a warning is shown, and nothing changes until the user clicks "Update to catalog data".
- **Removed components.** When a 3D part is removed, its mapping is kept and flagged as an orphan. It is excluded from the BOM until the user removes or remaps it. Wiring records that point to a missing component are flagged as an unknown endpoint.

### Compatibility rules

The checks are grouped into four areas:

- **Motor and driver** (updated in the final corrections).
  - The total number of motors is compared with the total number of driver channels.
  - Each motor is checked against **its own assigned driver**. The assignment is stored on the motor mapping as `driverMappingId` and chosen with the "Driver" selector in Real Parts.
    - With exactly one mapped driver, an unassigned motor uses that driver, and the check title says "the only mapped driver".
    - With two or more drivers, an unassigned motor gets an **Unknown** "driver not assigned" check and no voltage or current check. It is never guessed.
    - If the assigned driver was removed, the motor gets an Unknown "no longer mapped" check.
  - The motor's rated voltage is compared with its driver's motor-voltage range: above the maximum is incompatible, below the minimum is a warning.
  - The motor's stall current is compared with its driver: above the peak is incompatible, above the continuous rating is a warning.
  - Each driver's channel capacity is compared with the motors assigned to it (`driverload:` checks).
  - Power checks (battery against motor, battery against driver) run for every motor and every driver.
- **Controller, driver logic and sensors.**
  - The controller logic voltage is compared with the driver logic range.
  - The sensor interfaces must be offered by the controller.
  - The sensor supply and signal level are compared with the controller logic voltage and GPIO input limit. A signal above the limit is reported as **GPIO overvoltage**.
  - The pin budget is checked only when the board states its pin count.
- **Power.**
  - The pack voltage is the holder's cell count multiplied by the cell voltage, and the cell quantity must match the holder.
  - The pack voltage is compared with the motor rating, the driver motor supply and the regulator input range.
  - The regulator current budget is checked; if a load's current draw is unknown, the result is Unknown.
  - The total stall current is compared with the battery's maximum current; if that maximum is not stated, the result is Unknown.
- **Mechanical.**
  - The wheel bore is compared with the motor shaft (diameter and D or round shape).
  - The real wheel diameter is compared with the 3D wheel diameter; more than 10 % apart is a warning.
  - The motor needs a bracket somewhere in the blueprint.
  - A real part that is more than 25 % larger than its 3D part gives a warning.
  - Ground clearance is always Unknown, because mounting heights are not modeled.

Every warning and incompatibility includes a reason. A check is never Compatible unless all of its inputs are known.

### Build History and saving (updated in the final corrections)

Every recorded event, whether from a model change, a Code Studio program change, a completed run or a blueprint action, marks the project as unsaved and increases `unsavedEvents`. The top bar shows the "Unsaved changes" indicator with an "N history" badge, and the Build History tab shows a banner.

- **Leaving.** Leaving the workspace with unsaved changes opens the existing dialog with Cancel, "Discard changes and leave" and "Save and leave", and the dialog states how many history events are unsaved. Closing or reloading the tab triggers the browser's warning.
- **What Save writes.** Save writes the blueprint whenever it has content or recorded history; only the automatic "Blueprint started" entry is not enough to create the field.
- **No save loop.** Loading a project does not mark it unsaved, and saving records no history event.
- **Old projects.** An untouched old project still saves without a `blueprint` field.

### Wiring

The wiring list is a planning aid and is labeled in the UI as "not a verified schematic". It is kept separate from the 3D model.

- **What gets flagged.** Each record is checked for these problems: unspecified pins, unknown voltage, voltage mismatch (against the part's accepted supply or logic range), GPIO overvoltage, insufficient current (the loads on a regulator output exceed its maximum), missing common ground, missing protection (a battery without a fuse or switch), and an unknown endpoint.
- **What gets drawn.** The overview diagram draws only records that have both pins named, a known voltage and no flagged problem.
- **The "standard wires" helper.** It adds the usual connections for the mapped driver, sensor and regulator. It leaves the controller pins empty, because the right pin depends on the board.

### Performance and security

- **Lazy loading.** The pane and the catalog are only loaded when the Blueprint is opened. All the engines are pure functions over small arrays, recomputed with `useMemo`.
- **Bounded data.** History is limited to 1000 events and versions to 20, and physics ticks and sensor readings are never recorded.
- **Links.** Links are https only, open with `rel="noopener noreferrer nofollow"`, and any credentials embedded in a URL are rejected. No images or external scripts are loaded.
- **CSV export.** Cells are quoted, and any cell that starts with `=`, `+`, `-` or `@` gets a leading apostrophe so a spreadsheet does not run it as a formula.
- **Stored data.** Only the browser's localStorage is used, and nothing is sent anywhere. The stored text is length-limited by the migration.
