# Phase 10 — Real hardware integration

## Part 0 — Architecture audit before the work

| Area | What existed after Phase 9 | Assessment for real hardware |
|---|---|---|
| Robot model (C1) | One robot model in `sceneStore`, read through `robotModelConnector` | Reused as is. No second model was added; the hardware profile references model joints and sensors by id |
| Command Bus (C2) | `movement.intent {linear, angular}` plus `speedPercent` drive both engines | Reused. The physical adapter **reads** the same intent; no second command bus |
| Sensor Stream (C3) | One `SensorStream` for simulated readings (`physics` / `kinematic`) | Made generic. Physical readings use a **separate instance** with a separate type (`source: 'physical'`), so a physical value can never be mistaken for a simulated one |
| Code Studio sandbox | Programs run in a sandboxed worker; `hostBridge` → `robotControl` → C2 | Kept. There was no way to talk to a device and no gate before a run; a run gate was added |
| Physics (Rapier) and kinematic engine | Simulation only | Untouched; the physical target never drives Rapier |
| Robot Blueprint (Phase 9) | Real parts, compatibility, wiring, BOM, history, undo | The natural home for the hardware profile and calibration (saved, undoable, versioned) |
| Persistence | Projects in `localStorage`; Blueprint optional | Hardware profile added as an optional, normalized field. No credentials stored |
| Gaps found | No transport, no protocol, no firmware, no safety states, no e-stop, no device identity check, no physical telemetry path | All addressed below |
| Risks found | (1) Programs are JavaScript in a browser: they cannot run on an ESP32. (2) A browser tab can freeze or close at any time. (3) No encoders on the reference motors | (1) Programs stay in the browser; only leased motion goes to the robot. (2) Every safety decision that matters is in the firmware (lease, heartbeat, watchdog, e-stop). (3) Open loop only, stated everywhere |

## Overview

```
Code Studio program (sandbox) ─┐
Hardware tab (jog, arm, e-stop)├─► robotControl / C2 movement.intent ─► Physical Hardware Adapter (100 ms loop)
Control Mode keys ─────────────┘                                          │ mixDifferential + limits
                                                                          ▼
                              connectionManager ── protocol v1 (strict allowlist) ── transport
                                    ▲                                                │
             physicalReadings (own stream, source "physical") ◄── TEL lines ◄────────┤
                                                                                     ▼
                                                     Web Serial (real ESP32)  or  SimulatedTransport
                                                                                     │
                                                    firmware RobotCore (C++)  ≡  DeviceCore (TS port)
```

## Modules (`src/features/hardware/`)

| Module | Responsibility |
|---|---|
| `protocol/protocol.ts` | The only encoder (allowlisted commands with range checks) and a strict parser for device lines; `programHash` (FNV-1a) |
| `transport/webSerial.ts` | Web Serial at 115200 baud, user-picked port only; support check (secure context, `navigator.serial`, permissions policy) |
| `transport/simulatedDevice.ts` | `SimulatedExplorerDevice` runs `DeviceCore`; fault hooks for tests. Labeled "Simulated device (no hardware)" |
| `device/deviceCore.ts` | TypeScript port of the firmware core, checked against the same vectors as the C++ |
| `connectionManager.ts` | Connection lifecycle, handshake, heartbeat, arming, jog, deploy, start, stop, e-stop, the physical adapter, history records |
| `hardwareStore.ts` | UI state and the displayed connection state |
| `hal/differentialDrive.ts` | Intent → left/right duty with the speed limit, start-up duty and inversion |
| `safety/validation.ts` | Reference parts, fixed pin map, power, switch, device checks → `canArm` |
| `deploy/programCheck.ts` | Static check of programs for the physical target |
| `physicalTelemetry.ts` | The physical sensor stream |
| `hardwareActions.ts` | Profile, calibration and validation actions on the Blueprint store |
| `components/` | Hardware tab, execution target selector, top-bar E-STOP and simulated-device badge |

## Transport choice

Web Serial was chosen over a localhost bridge: it needs no extra program, the browser shows its own port picker (the page cannot open a port the user did not choose), and it works offline. It is available in Chrome and Edge on desktop only; the Hardware tab says so when it is missing. No network transport, Wi-Fi or Bluetooth was added, so the robot cannot be reached from anywhere but the USB cable.

## Connection states

`not-connected → waiting-permission → connecting → connected → running → stopping`, plus `disconnected` (link lost), `fault` and `emergency-stopped`. A port that is open but has not passed the handshake is shown as **connecting**, never connected. A pending attempt can be cancelled.

The handshake checks device id `explorer-bot-esp32`, board `esp32-devkitc-v4` and protocol `1`. Anything else blocks arming.

## Execution model (deploy is not flashing)

1. **Validate** — profile, wiring, power, switch, device.
2. **Prepare** — the program is generated (Blockly → JavaScript) and statically checked; features the physical robot lacks are refused.
3. **Deploy** — the program's hash is registered on the device with `PROGRAM <hash>`. No code is sent.
4. **Start** — needs armed, the same hash deployed, and an explicit confirmation. The run gate refuses anything else.
5. The program runs in the browser sandbox. The adapter turns `movement.intent` into `DRIVE` leases (300 ms, every 100 ms). `sensor.read` for the distance sensor is answered from the physical stream.
6. **Stop / Pause / Disconnect** end the activity and stop the motors; the run-time limit stops long runs.

## Physical sensors

`TEL` lines carry duty, enable state, distance in mm and a status (`ok`, `out-of-range`, `stale`, `err`). Readings go to `physicalReadings` with `source: 'physical'`; the simulated stream is never written. The device advertises `enc=0`, so encoder, IMU and odometry calls are refused on the physical target instead of being faked.

## Calibration

Stored in `blueprint.hardwareProfile.calibration` (motor inversion, start-up duty, measured wheel diameter, track width, optional encoder ticks, known distance and offset). It is separate from the 3D model, which is never changed; the Hardware tab shows virtual and measured values side by side.

## History

`hardware.connected/disconnected/firmware/profile/validated/calibration/fault/estop` and `program.prepared/deployed/started/stopped`. A fault or e-stop that latched while the link was down is recorded from the handshake. Telemetry samples, port identifiers, credentials and tokens are never recorded.

## Firmware

See `docs/hardware/ESP32-FIRMWARE-SETUP.md`. The portable core (`lib/robot_core`) holds all protocol and safety logic and is host-tested; `src/main.cpp` is thin glue.
