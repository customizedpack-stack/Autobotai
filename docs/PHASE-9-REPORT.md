# Phase 9 Report — Real-World Robotics Blueprint

Date: 2026-11-20. Branch: `phase-9-blueprint` (based on `phase-8-camera`), with the final corrections on `phase-9-corrections`. Version: 0.9.0.

> **Final corrections (2026-11-20):** each motor is now checked against its own assigned motor driver, and unassigned motors are Unknown when there are several drivers. Build History events now mark the project unsaved, appear in the leave warning, and are saved with the project. The latest gate: 430/430 unit tests and 12/12 e2e suites with 214/214 steps, all commands exit 0. Details: `docs/PHASE-9-FINAL-CORRECTIONS.md`.

## Summary

The Robot Blueprint is a new workspace mode. It turns the simulated robot into a real-world build plan:

- **Real Parts.** You map each 3D component to a verified real part, and electronics the 3D model does not show can be added as hardware items.
- **Compatibility.** Checks report one of four statuses, and every warning comes with a reason.
- **Wiring.** A list of wiring records with automatic flags and a diagram that only draws safe wires.
- **BOM.** A bill of materials with CSV export and printing to PDF.
- **Build Guide.** A guide with 14 sections where you set each step's status and add notes.
- **Build History.** A log of design events plus saved versions that you can compare and restore.

None of this changes the 3D model, the physics, the drive, the cameras, the sensors or Code Studio. The architecture assessment and the design are in `docs/architecture/PHASE-9-ROBOT-BLUEPRINT.md`.

## Implemented

| Part | Status |
|---|---|
| 0. Architecture inspection and assessment | Done. The assessment is in Part A of the architecture document. |
| 1. Real-World Parts Library | Done. There are 14 curated parts across all 7 categories, and every entry has a source and a check date (see "Parts library and data sources" below). The catalog is loaded lazily, validated, deduplicated, and its links are sanitized. |
| 2. Mapping virtual components to real parts | Done. The Real Parts tab supports search, a category filter, select, replace, remove, quantity and required/optional, comparing up to 3 alternatives, documentation links and missing-information lists. It also shows where the 3D model differs from the real part. Nothing is mapped automatically. Each mapping stores a snapshot of the part data. |
| 3. Compatibility engine | Done. Each motor is checked against its own assigned driver (final corrections). It covers motors with the driver, the controller with the driver logic and the sensors (including GPIO overvoltage), power (pack voltage, regulator input, current budget, stall current) and mechanics (shaft and bore, wheel size, mounting, part size, clearance). Unknown is never shown as Compatible. |
| 4. BOM | Done. It updates live, counts packs (for example, a wheel pair covers 2 wheels), uses verified list prices only, and shows a total only when every line is priced. It supports extra hardware, required and optional lines, CSV export (with a guard against spreadsheet formulas) and Print / Save as PDF. A price notice is included. |
| 5. Wiring records | Done. Wires can be edited, and standard wires can be added for the mapped parts. Eight kinds of problems are flagged. The overview diagram draws only fully specified, checked wires. The list is labeled "not a verified schematic" and is kept separate from the 3D model. |
| 6. Build Guide | Done. It has 14 sections and stable step ids. Each step has one of four statuses and a user note. Steps are never completed automatically, and statuses survive when the guide is regenerated. |
| 7. Build History | Done. Model events, Code Studio program changes and completed runs, and every blueprint action are recorded. The log is limited to 1000 entries and never records physics ticks or sensor readings. Up to 20 versions can be saved, compared with the current state and restored (restoring changes blueprint data only). |
| 8. Robot Blueprint workspace | Done. A new top-bar mode, **Blueprint**, shows 8 tabs beside the live viewport. Navigation buttons lead to Build, Control, Code Studio, Environment Editor, Camera Monitor and Sensor Monitor. Empty tabs show empty states. The status bar shows "Robot Blueprint" and "Phase 9". |
| 9. Data model | Done. Projects get an optional `blueprint` field and the schema stays v3. The load-time migration is idempotent. Undo and redo work for blueprint edits (Ctrl+Z and the top-bar buttons in Blueprint mode). Invalid catalog references are handled. Data is stored locally only. |
| 10. Unit tests | Done. There are 25 new tests in `src/features/blueprint/tests/blueprint.test.ts`. |
| 11. Browser workflow | Done. All 22 steps passed, plus layout checks at 900 and 600 px and a check for console errors. |
| 12. Performance and security | Done. See the architecture document. The pane and the catalog are separate lazy chunks. |
| 13. Final verification | Done (see below). |

## Automated tests passed

| Command | Result |
|---|---|
| `npm run typecheck` | Passed (no errors) |
| `npm run lint` (oxlint) | Passed (no warnings or errors) |
| `npm run test` (Vitest) | **420 / 420** tests in 43 files. This is the 395 earlier tests plus 25 new Phase 9 tests. No test was weakened or deleted. After the final corrections: **430 / 430** in 44 files. |
| `npm run build` | Passed. The Blueprint pane and the parts catalog are separate chunks that load only when the Blueprint is opened. |
| `npm run test:e2e` | **12 / 12 suites, 209 / 209 steps** (after the final corrections: **214 / 214**, with the blueprint suite at 30 steps). Workspace 21, corrections 20, builder 21, control 17, code-studio 20, physics 15, sensors 11, environment 19, verification 13, drive-compatibility 9, camera 18, and blueprint 25 (new). |

The new unit tests cover these areas:

- **Catalog.** Validation, duplicates, unsafe links, invented prices, search, the category filter and missing specs.
- **Mapping.** No automatic mapping, the model left unchanged, replace, remove, quantity, undo and redo, catalog snapshots, and orphans.
- **Compatibility.** Each area has at least one compatible, one warning, one incompatible and one unknown case.
- **BOM.** Packs, verified prices, hidden totals, optional lines, and CSV escaping including the formula guard.
- **Wiring.** All flag kinds, including insufficient current, and the rule that only safe wires are drawn.
- **Guide.** 14 sections, stable ids, statuses kept, and no automatic completion.
- **History and migration.** Bus events, the 1000 cap, compare and restore, an idempotent migration, and dropped invalid entries.
- **Older projects.**
  - A Phase 1 project opens with an empty blueprint, and saving it adds no blueprint field.
  - A Phase 3 project (no sensors) and a combined Phase 5 + 7 + 8 project (physics overrides, an environment and a camera) save and reload with every id and field preserved, and saving again changes nothing.

## Browser tests passed

`tests/e2e/blueprint.e2e.mjs` ran headless Chrome with software rendering on port 4199. Screenshots are in `docs/testing/phase-9/`.

| Step | Result |
|---|---|
| 1 Open Explorer Bot | Pass |
| 2 Open the Blueprint (8 tabs, overview, live viewport, navigation) | Pass |
| 3 Browse the catalog (motor category preselected, driver and camera filters, compare table, https links opening in a new tab) | Pass |
| 4 Map a DC motor (both motors → Pololu 100:1 HP 6V) | Pass |
| 5 Map two wheels (the 140 mm 3D wheel vs the 70 mm real wheel is shown) | Pass |
| 6 Map a driver (hardware item → TB6612FNG) | Pass |
| 7 Map a controller (ESP32-DevKitC V4) | Pass |
| 8 Map a distance sensor (HC-SR04) | Pass |
| 9 Review compatibility (GPIO overvoltage is incompatible; motor current warns because the 1.6 A stall exceeds the 1 A continuous rating) | Pass |
| 10 Fix the incompatibility (VL53L0X; 0 incompatible) | Pass |
| 11 Generate the BOM (5 lines; the wheel pair counts as 1; no total because two lines have no verified price; CSV checked) | Pass |
| 12 Review wiring (standard wires, unspecified pins flagged, 4 or more safe wires drawn) | Pass |
| 13 Generate the guide (14 sections, nothing completed) | Pass |
| 14 Mark a step in progress | Pass |
| 15 Add a note | Pass |
| 16 Change a mapping (ESP32 → Arduino UNO R3) | Pass |
| 17 History records the change (plus the BOM and guide events, and a saved version) | Pass |
| 18 Save and reload | Pass |
| 19 Everything preserved (7 mappings, wire pins, step status and note, history, version, BOM) | Pass |
| 20 Control Mode drives the robot (W moves it; no drive error) | Pass |
| 21 Code Studio programs intact ("Blueprint Drive Test"; drive ready) | Pass |
| 22 Camera Monitor works (camera added; live frames) | Pass |
| Layout at 900 and 600 px (no horizontal page overflow; all tabs reachable) | Pass |
| No browser console errors | Pass |

## Not tested

- **Printing to PDF.** The print dialog cannot be driven in headless Chrome. The print stylesheet, which prints only the BOM table, was not checked visually.
- **Real screen readers and touch devices.**
- **Larger robots.** The workflow was tested on Explorer Bot only. The Robotic Arm, Humanoid and Quadcopter templates open in the Blueprint (the virtual components come from the same code) but were not mapped in a browser test.
- **Safari and Firefox.**

## Known limitations

- **Size of the catalog.** The parts library is intentionally small (14 parts), because each part has to be checked against the manufacturer's documentation. Several categories in the brief have no verified entry yet, and the picker shows an empty state for them:
  - servo, stepper and linear-actuator motors;
  - L298N, BTS7960 and stepper drivers;
  - Jetson;
  - IMU, encoder, IR, GPS and LiDAR sensors;
  - all cameras;
  - BMS;
  - chassis, plates, bearings, shafts, screws and gears.
- **Fetch access during research.** Approval to open additional manufacturer pages was not available during the research, so some candidates could not be verified and were left out rather than guessed. They included the Arduino page, Raspberry Pi camera, Logitech, Intel RealSense, Slamtec, SKF, Hitec, Infineon and ST.
- **Compatibility checks are datasheet-level.** They do not model:
  - the regulator dropout at a given load;
  - battery internal resistance;
  - voltage sag during motor stalls;
  - wire gauge;
  - thermal limits;
  - real mounting geometry.
- **The pin budget is approximate.** It counts IN1, IN2 and PWM per driver channel plus STBY, and two I²C pins. It is only checked when the board states its pin count; the ESP32-DevKitC pin count is not stated, so for it the result is Unknown.
- **Hardware items have no 3D shape.** Blueprint-only hardware items (driver, battery, regulator) do not appear in the 3D model, by design.
- **The wiring diagram is a simple two-column overview,** not a schematic editor.
- **Build History needs a Save.** Fixed in the final corrections: history events now mark the project unsaved, the leave dialog warns about them (Cancel / Discard / Save and leave), and Save always writes them.
- **Prices.** Prices are single-item manufacturer list prices on 2026-11-20 in US dollars. They are not live, and availability is never claimed.

## Parts library and data sources

| Part | Data | Verification |
|---|---|---|
| Pololu 1101, 100:1 Micro Metal Gearmotor HP 6V | Pololu product specs | Verified, with price |
| Pololu 1581, 4.4:1 25D LP 6V gearmotor | Pololu product specs (size and weight not shown) | Partial, no price |
| Pololu 1429, Wheel 70×8 mm pair | Pololu product specs | Verified, with price |
| Pololu 951, Ball caster 3/8″ metal | Pololu ball caster category table | Verified, no price |
| Pololu 989, Micro metal gearmotor bracket pair | Pololu product specs | Verified, with price |
| Pololu 713, TB6612FNG dual motor driver carrier | Pololu product specs | Verified, with price |
| Espressif ESP32-DevKitC V4 | Espressif user guide and ESP32 datasheet | Partial (no board size, pin count or price) |
| Arduino UNO R3 | Arduino tech-spec table as reproduced by an authorized reseller | Partial |
| Raspberry Pi 4 Model B | Raspberry Pi product brief and datasheet | Partial (price depends on memory option) |
| Pololu 2490, VL53L0X ToF carrier | Pololu product specs | Verified. No price is stored, because two checks on the same day showed different prices. |
| HC-SR04 (generic) | ElecFreaks datasheet | Unverified (generic part) |
| Pololu 2831, D24V10F5 5V 1A step-down regulator | Pololu product page | Verified, with price |
| 4-AA battery holder (Pololu 1153) | Pololu product specs | Verified, with price |
| Panasonic eneloop BK-3MCCE AA | Panasonic spec page | Verified (no maximum discharge current) |

**Unverified specifications that remain:**

- All HC-SR04 values. The part is generic, so clones can differ.
- The ESP32 GPIO input limit. It is set to the 3.3 V I/O supply; a reference also states that the pins are not 5 V tolerant.
- The Arduino UNO R3 values, which come from a reseller copy of the Arduino table.
- Every field marked "Unknown" in the UI.

## Future hardware deployment requirements (not started)

Real hardware is out of scope for Phase 9; nothing is flashed, connected or sent. A later phase would need the following:

- **Firmware.** A firmware or code generator for the mapped controller that translates the Code Studio robot API (`robot.drive`, sensors, camera) to real pins and libraries.
- **Pin assignment.** Confirmed pin assignments per board (strapping and boot pins, input-only pins), checked against the wiring records.
- **Connection and safety.** A serial or Wi-Fi connection to the robot with a safety model: an e-stop, a watchdog, speed limits, and confirmation before the motors turn.
- **Calibration.** The real wheel diameter, the encoder counts per revolution and the motor direction, fed back into the simulation.
- **Power.** Validation with real measurements, such as voltage under load and stall current, instead of datasheet values.
- **User acknowledgment.** Before any hardware action, the user confirms they understand the electrical safety risks.

Phase 10 was not started.
