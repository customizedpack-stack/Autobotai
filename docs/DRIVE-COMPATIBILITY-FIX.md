# Drive Compatibility Fix — "Set up differential drive" on older Explorer Bots

Date: 19 Nov 2026. Branch `phase-8-camera` (Part A, done and gated before any camera work).

## 1. The report

The project "My Explorer Bot" opens with visible wheels. In Control Mode, **Set up differential drive** answers "No pair of revolute wheel joints on the same part was found. Add two wheels with revolute joints first." Movement commands are rejected.

## 2. Reproduction

The issue was reproduced with real data before anything was changed:

- **Data:** the Phase 1 Explorer Bot, copied verbatim from Phase 1 (commit `f163ce8`, `templates.ts` and `materialize.ts`), saved as schema v1 the way Phase 1 stored it.
- **Load path:** it was loaded through today's migration and drive setup.
- **Result:** 0 joints, 0 actuators, 0 controllers. All three wheel parts (two wheels and the caster) have no parent. `suggestDifferentialDrive` returns exactly the reported message.
- **Browser:** the same happens in the real app (screenshot 01). The setup cannot work, and pressing W logs `Command "drive" rejected: This robot has no drive controller.`

## 3. Diagnosis (the questions from the brief)

| Question | Finding |
| --- | --- |
| Are both wheel objects present? | Yes: "Left Wheel" and "Right Wheel" (plus "Caster Ball"). |
| Are they categorized as `wheel`? | Yes. |
| Are their joint types revolute? | **There are no joints at all.** |
| Do both joints have the same chassis parent? | No joints; **every part has `parentId: null`** (no hierarchy). |
| Are joint parent/child ids valid? | Not applicable (no joints). |
| Do old project migrations create the required joints? | **No — this is the root cause.** v1 → v2 keeps the flat parts and adds `joints: []`. v2 → v3 then tries to set up the Explorer Bot drive, finds no joints, and only adds a console warning. |
| Is the project loaded without its drive configuration? | It never had one; nothing was lost during loading. |
| Does the setup button use the latest scene state? | Yes (`robotModelConnector.model()` reads the scene store at click time). |
| Are wheel joints attached to different parents? | No joints exist. The guided setup now reports this case separately when it happens. |
| Is the template different from the loaded project? | **Yes.** Phase 1 had no joints and a flat part list. It also named the +Z wheel "Left Wheel", which is the robot's right side (left is −Z when facing +X). Since Phase 2 the template has a hierarchy, two revolute wheel joints and the corrected sides. |

**Root cause:** Explorer Bots saved in Phase 1 (schema v1) have no joints and no part hierarchy. No migration ever added them, so the drive setup could never find two revolute wheel joints on one part. Projects saved in Phase 2 or later are not affected, because they have their wheel joints, and the v2 → v3 migration sets up their drive.

## 4. Fix

### 4.1 Safe repair (`src/features/robot-model/driveRepair.ts`, new)

`planDriveRepair` repairs a robot **only** when it can be identified safely:

- exactly one chassis part;
- exactly two cylinder wheel parts, neither with a joint, each either loose or already attached to the chassis;
- both wheels spin sideways and sit on opposite sides;
- no differential-drive controller exists. A valid custom drive is never replaced.

**What the repair does:**

1. If every part is loose (the Phase 1 layout), it attaches each part to the chassis, keeping its world position exactly (`reparentComponent`).
2. It adds the two revolute wheel joints (`createJoint`), with the axle along the wheel's own axis. The joints are named by the physical side ("Left Wheel Joint" at −Z).

Object ids, transforms, dimensions, sensors and the project's `environmentId` are kept.

`repairAndSuggestDrive` then runs the existing `suggestDifferentialDrive`, which pairs each wheel with the nearest motor part and measures the radius and track width. The result is **all or nothing**: when any step fails (for example, no motor parts), nothing is changed, so there are never joints without a drive.

`diagnoseDrive` lists the four requirements (two drive wheels, both on the same part, revolute wheel joints, two motor parts), with ✓ or ! and the exact detail for each.

### 4.2 Where it is used

| Path | Behavior |
| --- | --- |
| **Set up differential drive** (`robotModelConnector.setUpDifferentialDrive`) | Works as before when the robot is ready. Otherwise it runs the safe repair, adds the motors and the drive as **one undo step**, and logs each repair action. It never creates a partial setup. |
| **Migration v2 → v3** (`schema.ts`) | For a v1 Explorer Bot, the existing automatic drive setup now repairs first, when that is safe. The migration warning says what was upgraded. Already-migrated v3 projects are not touched on load; their owners use the button. |
| **Guided setup UI** (`DriveSetupGuide.tsx`, new; Control panel and Build inspector) | Shows the checklist. For a repairable robot it explains what Set up will do. For an unsafe robot it shows the exact problems, and the setup error is shown in the panel, not only in the console. |

### 4.3 What is never done

- No fake controller, and no hidden error.
- No change to a robot that cannot be identified safely, to existing joints (for example a fixed wheel joint), to wheels attached to another part, or to an existing drive.

## 5. Expected result for a valid Explorer Bot (verified by test)

- Two wheel objects.
- Two revolute wheel joints, both on "Chassis".
- Two DC motor actuators, each bound to the wheel joint on its own side.
- One Differential Drive.
- Left joint at −Z and right joint at +Z.
- Wheel radius 0.07 m and track width 0.31 m.

## 6. Tests

`src/features/robot-model/driveCompatibility.test.ts`, 16 tests (the brief's 14 cases, case 2 split into 2a/2b, plus the reproduction):

| # | Case | Result |
| --- | --- | --- |
| — | Reproduction: stored legacy project has wheels, no joints; plain detection fails | Passed |
| 1 | Fresh Explorer Bot (drive correct; Set up refused, nothing changed) | Passed |
| 2a | Legacy v1 Explorer Bot via migration (ids kept, every part at the same world position) | Passed |
| 2b | Legacy Explorer Bot as stored today (v3, flat): Set up repairs and configures, one undo step, `environmentId` kept | Passed |
| 3 | Two valid revolute wheel joints, no controller: set up with no structural change | Passed |
| 4 | Only one wheel: clear error, nothing changed | Passed |
| 5 | Two wheels with fixed joints: explained, never changed automatically | Passed |
| 6 | Wheels on different parents: named in the error, nothing changed | Passed |
| 7 | Missing motors: exact message, no partial repair | Passed |
| 8 | Existing valid custom drive: never overwritten by setup, repair or migration | Passed |
| 9 | Repeated setup clicks and repeated migration: no duplicates | Passed |
| 10 | Save, reload, drive again | Passed |
| 11 | Undo and redo of the repair-and-setup step | Passed |
| 12 | Kinematic movement (forward; a left turn goes toward −Z) | Passed |
| 13 | Physics movement and collision with a custom wall | Passed |
| 14 | JavaScript and Blockly drive commands | Passed |

**Proof that the tests check the fix:** with the connector and migration changes removed, 12 of the 16 tests fail. The four that still pass are the reproduction and cases 1, 3 and 8, which describe behavior that was already correct.

**Browser:** `tests/e2e/drive-compatibility.e2e.mjs`, 9 steps (section 7).

## 7. Browser workflow (real Chrome, production build)

| Step | Result |
| --- | --- |
| A1 Legacy "My Explorer Bot" (stored as v3 flat) opens in Control; the guide shows the missing parent and joints and what Set up will do | Passed |
| A2 Before setup, W is refused with the reported message | Passed |
| A3 Set up differential drive succeeds (success and repair messages) | Passed |
| A4 W/A/S/D move the robot (kinematic): W moved it 0.154 m forward; A turned it +24.8°; D turned it back; S moved it back | Passed |
| A5 W in the Physics engine: 0.329 m forward | Passed |
| A6 Save, reload, reopen: the drive is kept and W still moves the robot | Passed |
| A7 A robot that cannot be repaired safely (one wheel): exact problem shown, nothing saved or changed | Passed |
| A8 A fresh Explorer Bot is unchanged and drives with W/A/S/D | Passed |
| No browser console errors | Passed |

Screenshots in `docs/testing/drive-compatibility/`:
1. `01-legacy-explorer-bot-before-setup.png` — the guided checklist and repair note.
2. `02-setup-succeeded.png`
3. `03-wasd-kinematic.png` — the repair log, including the side note about the wheel names.
4. `04-wasd-physics.png`
5. `05-after-reload.png`
6. `06-unsafe-robot-guided-message.png`
7. `07-fresh-explorer-bot.png`

## 8. Part A verification gate

Run on 19 Nov 2026, on the final Part A code, one command after another:

| Command | Exit code | Result |
| --- | --- | --- |
| `npm run typecheck` | 0 | Pass |
| `npm run lint` | 0 | 0 warnings, 0 errors |
| `npx vitest run` | 0 | 365 passed, 0 failed, 0 skipped (41 files; 349 before plus 16 new) |
| `npm run build` | 0 | Pass |
| `npm run test:e2e` | 0 | 10 suites, 166 / 166 steps: workspace 21, corrections 20, builder 21, control 17, code-studio 20, physics 15, sensors 11, environment 19, verification 13, drive-compatibility 9 |

**Gate: Passed.** Part B (camera simulation) was started only after this.

## 9. Files

**New:**
- `src/features/robot-model/driveRepair.ts`
- `src/features/inspector/DriveSetupGuide.tsx`
- `src/features/robot-model/driveCompatibility.test.ts`
- `src/features/robot-model/fixtures/phase1ExplorerBot.ts`
- `tests/e2e/drive-compatibility.e2e.mjs`
- this document and its screenshots

**Modified:**
- `src/features/robot-model/robotModelConnector.ts` (setup uses the repair)
- `src/features/robot-model/schema.ts` (v2 → v3 repairs v1 Explorer Bots)
- `src/components/workspace/RobotControlPanel.tsx` and `src/features/inspector/ControllerSection.tsx` (the guided setup)
- `tests/e2e/run-all.mjs`

The schema version is unchanged (v3).

## 10. Known limitations

- The repair recognizes the Phase 1 layout and robots with two unjointed wheels on, or loose next to, a single chassis. Other custom robots get the exact problem list instead of an automatic change, by design.
- Phase 1's part names "Left Wheel" and "Right Wheel" are kept (user data is not renamed). The drive uses the physical sides, and the console says so. Users can rename the parts in Build Mode.
- Legacy projects get default sensors only through the existing **Add default sensors** button (Phase 6); the repair does not add sensors.

## 11. UI polish after Phase 8: stale error and wheel labels (19 Nov 2026)

**Stale error.** In the old screenshot 02 the setup had succeeded, but the Robot Control panel still showed the red message "This robot has no drive controller. Use "Set up differential drive" first." That message came from the W press made *before* the setup. The Command Bus stored it in `movement.lastError`, and nothing cleared it when the robot changed.

**Fix:**
- The Command Bus now remembers when a shown error came **only** from the drive-setup check (no controller, missing or disabled motor, and so on).
- Whenever the robot model changes, `clearObsoleteDriveError()` clears that error **unless the same setup problem still exists**.
- A successful setup, from the Control panel or the Build inspector, therefore clears it.
- Genuine current errors stay visible: a setup that failed, a motor that is still disabled, or a command with a bad value (that is not a setup problem, so model changes never hide it).
- The console history is not edited.

**Wheel labels.** The Drive section in Control Mode and the drive settings in the Build inspector now show each side by **physical position**, taken from the drive controller: the wheel part and its joint, for example "Left wheel: Right Wheel · Left Wheel Joint" on a repaired Phase 1 robot. When a part's name says the other side, the repair's naming warning now stays visible there, instead of appearing only once in the console. Nothing is renamed or moved. A fresh Explorer Bot shows matching names and no warning.

**Files:**
- `src/features/controls/commandBus.ts`
- `src/features/robot-model/wheelAssignment.ts` (new)
- `src/features/inspector/WheelAssignmentView.tsx` (new)
- `src/features/inspector/ControllerSection.tsx`
- `src/components/workspace/RobotControlPanel.tsx`
- `src/features/robot-model/driveRepair.ts` (shared warning text)

**Tests:**
- 5 new unit tests in `driveCompatibility.test.ts`:
  - error cleared after setup in Control Mode;
  - error cleared after setup in Build Mode, and undo brings no stale error back;
  - a fresh robot shows no error;
  - current errors stay: a failed setup, a disabled motor, a bad value;
  - wheel labels by physical side, warnings kept, no renaming or moving.
- With the Command Bus fix removed, the two error-clearing tests fail, as intended. The Build Mode test also passes on the old code, because switching to Build Mode already resets the movement state; it remains as a guard.
- Browser: step A3 now checks that no red error is shown after setup, the left/right labels ("Right Wheel" is the left wheel) and both naming warnings; step A8 checks that a fresh Explorer Bot has no error and no warning.
- `02-setup-succeeded.png` was captured again and shows the successful setup without the stale error.

**Gate (final code):**

| Command | Exit code | Result |
| --- | --- | --- |
| `npm run typecheck` | 0 | Pass |
| `npm run lint` | 0 | 0 warnings, 0 errors |
| `npx vitest run` | 0 | 395 passed, 0 failed (42 files; 390 before plus 5 new) |
| `npm run build` | 0 | Pass |
| `npm run test:e2e` | 0 | 11 suites, 184 / 184 steps (drive-compatibility 9/9, camera 18/18) |
