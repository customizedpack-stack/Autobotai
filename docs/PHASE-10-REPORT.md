# Phase 10 report — Real hardware integration and deployment

Branch `phase-10-hardware` (based on `phase-9-corrections`). Version 0.10.0.

## Summary

AutoBotAI can now connect to one reference robot, the **Explorer Bot on an ESP32-DevKitC V4 with a TB6612FNG driver, two Pololu 1101 gearmotors and a VL53L0X distance sensor**, over USB (Web Serial). It validates the hardware profile, identifies the firmware, arms only on explicit confirmation, drives at low speed, reads the physical distance sensor, deploys and starts programs on a "physical" execution target, and stops safely on an emergency stop, a lost link or a watchdog reset.

**No physical hardware was available. All physical hardware tests are NOT RUN.** Every hardware result below comes from unit tests, the simulated device or the firmware host tests, and is labeled that way.

## Results by status

| Status | What |
|---|---|
| **Source implemented** | Protocol v1 (strict allowlist), Web Serial transport, simulated device, connection manager with 9 states, physical hardware adapter (reuses C2 `movement.intent`), differential-drive mixing with limits, physical sensor stream, validation and arming interlocks, deploy/start run gate, execution target selector, top-bar E-STOP, Hardware tab (connection, profile, validation, arming, deploy, jog, calibration, monitor), history events, ESP32 firmware (`firmware/esp32-explorer-bot/`), five documents |
| **Unit tested** (Vitest, jsdom) | Protocol parsing and encoding limits, line splitting, differential-drive limits and start-up duty, program checks, validation and interlocks, pin-map mismatch, calibration persistence and undo, Web Serial support detection, Phase 9 compatibility with the profile |
| **Integration tested** (Vitest with the **simulated device**, not hardware) | Handshake, failed handshake, cancelled connection, arming confirmation, jog and stop, emergency stop and reset, local stop button, communication loss → firmware stop and latched fault, reconnect without resume, fault reported at handshake recorded in history, device reset mid-session, invalid-line flood, physical telemetry in its own stream, deploy/start/stop with the run gate, pause/resume stops and restarts motion, disconnect disarms, calibration test |
| **Browser tested** (Playwright, **simulated device**) | Workflows A–P in `tests/e2e/hardware.e2e.mjs` (23 steps), layout at 900 and 600 px, no console errors, plus all 12 earlier suites |
| **Firmware tested** (host g++, not the ESP32 toolchain) | `lib/robot_core`: safe boot, motors disabled by default, invalid command rejection, session checks, lease expiry, heartbeat timeout fault, watchdog-reset fault on boot, emergency stop (command and button), sensor staleness/error reporting, millis wrap. 18 shared vector cases also run by the TypeScript core |
| **Physical hardware tested** | **None** |
| **Not tested** | `src/main.cpp` on a real ESP32 (PWM, I²C, task watchdog, serial), Web Serial with a real port, real motor and sensor behavior, battery behavior |
| **Blocked** | **ESP32 firmware compilation**: the ESP32 toolchain (PlatformIO/arduino-cli packages) could not be downloaded in this environment, so `main.cpp` was never compiled. Build it with PlatformIO as in `docs/hardware/ESP32-FIRMWARE-SETUP.md` |

## Final verification (exact commands and results)

| Command | Exit code | Result |
|---|---|---|
| `npm run typecheck` | 0 | No errors |
| `npm run lint` | 0 | oxlint, no findings |
| `npm run test` | 0 | 46 files, **477 tests passed** |
| `npm run build` | 0 | Production build succeeded |
| `npm run test:e2e` | 0 | **13 suites, 237 steps passed** (workspace 21, corrections 20, builder 21, control 17, code-studio 20, physics 15, sensors 11, environment 19, verification 13, drive-compatibility 9, camera 18, blueprint 30, hardware 23) |
| `npm run test:firmware` | 0 | 18 vector cases, 254 instructions, **261 checks passed** (host g++) |
| ESP32 compile (`pio run -e esp32dev`) | — | **BLOCKED** (toolchain unavailable) |

## Physical hardware tests (Part 13 D)

| # | Test | Result |
|---|---|---|
| 1 | Connect ESP32 | NOT RUN |
| 2 | Identify firmware | NOT RUN |
| 3 | Validate hardware profile | NOT RUN |
| 4 | Motors remain disabled on connection | NOT RUN |
| 5 | Arm explicitly | NOT RUN |
| 6 | Low-speed forward | NOT RUN |
| 7 | Reverse | NOT RUN |
| 8 | Left and right turns | NOT RUN |
| 9 | Stop | NOT RUN |
| 10 | Distance sensor | NOT RUN |
| 11 | Disconnect while moving at low speed | NOT RUN |
| 12 | Firmware stops motor outputs | NOT RUN |
| 13 | Emergency stop | NOT RUN |
| 14 | Reconnect; motion does not resume | NOT RUN |

The same 14 behaviors pass against the **simulated device** (integration and browser tests). That is not a physical result.

## Browser workflows (Part 14, simulated device)

A open Explorer Bot · B open Blueprint · C validate the hardware mapping · D Hardware workspace · E connect (simulated, labeled) · F handshake · G device profile can arm · H prepare · I deploy (no motion) · J arm (refused without confirmation) · K low-speed jog · L physical-format telemetry (ok and out of range) · M start on the physical target and stop · N disconnect (disarms) · O Control driving, Code Studio on Simulation, Environment Editor and camera still work · P failed handshake, link loss with latched fault and no resume, top-bar emergency stop with reset. Screenshots: `docs/testing/phase-10/` (all named `simulated-device-*`).

## Decisions

- **Web Serial instead of a localhost bridge**: no extra program, the browser's own port picker, no network exposure.
- **Programs stay in the browser.** "Deploy" registers the program's hash on the device; "Start" is refused unless that hash is deployed and the robot is armed. Nothing is flashed and no JavaScript runs on the ESP32.
- **Safety lives in the firmware**: 500 ms maximum motion lease, 1 s heartbeat timeout with a latched fault, 2 s task watchdog, latched emergency stop, firmware-side speed and acceleration limits.
- **One model, one command bus**: the physical adapter reads C2 `movement.intent`; physical readings use a separate stream and type.
- **Profile and calibration in the Blueprint**, so they are saved, undoable and versioned with the project; the 3D model is never changed.
- **Unknown is unsafe**: battery current, the motor-power switch and any unverified part block arming until the user supplies them.

## Reference hardware findings

Conditionally compatible. Warnings: 4.8 V pack is below the motors' 6 V rating; motor stall current (1.6 A) exceeds the driver's 1 A continuous rating (3 A peak); battery maximum current unknown (user entry); ground clearance unknown; no verified e-stop switch part (user-supplied); the Pololu D24V10F5 regulator is incompatible with a 4.8 V pack, so the ESP32 is powered from USB. Details: `docs/hardware/EXPLORER-BOT-REFERENCE-HARDWARE.md`.

## Known limitations

- Open loop only: the reference motors have no encoders, so there is no closed-loop speed, odometry or exact distance driving.
- Web Serial only works in desktop Chrome and Edge.
- The physical target supports driving and the front distance sensor. Programs that use encoders, the IMU, cameras, joints or subscriptions are refused.
- Turning and distance on the floor depend on calibration you measure yourself.
- The software emergency stop depends on the USB link and the firmware; the motor-power switch is the real last resort. Nothing here is safety-certified.
- `src/main.cpp` has not been compiled (see Blocked).

## Changed and added files (main ones)

- `firmware/esp32-explorer-bot/` (core, glue, PlatformIO config, vectors, host tests)
- `src/features/hardware/` (protocol, transports, device core, connection manager, store, HAL, validation, deploy check, telemetry, actions, components, tests)
- Blueprint: hardware profile type, normalization, history types and labels, Hardware tab and Overview card
- Sensor stream made generic; sandbox sensor override for physical runs; execution run gate
- Top bar E-STOP and simulated-device badge; Code Studio execution target; status bar "Phase 10"
- `tests/e2e/hardware.e2e.mjs`, `tests/e2e/run-all.mjs`, `package.json` (`test:firmware`, version 0.10.0), README
