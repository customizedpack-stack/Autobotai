# Phase 10 screenshots — SIMULATED DEVICE

Every screenshot in this folder was taken by `tests/e2e/hardware.e2e.mjs` with the **simulated device** (the firmware logic running inside the browser page). **No physical hardware was connected.** The file names start with `simulated-device-`, and the app shows a "Simulated device" badge next to the E-STOP button and a banner in the Hardware tab.

| File | Workflow step |
|---|---|
| `simulated-device-01-hardware-workspace-empty.png` | D — Hardware tab before any device or profile |
| `simulated-device-02-validation-blockers.png` | C — power supply, motor-power switch and pin map blocking arming |
| `simulated-device-03-validation-ready.png` | C — all blockers fixed and warnings accepted |
| `simulated-device-04-connected-handshake.png` | E/F — connected after the handshake; motors disabled |
| `simulated-device-05-armed.png` | J — armed after the safety confirmation |
| `simulated-device-06-jog-forward.png` | K — holding Forward (low speed) |
| `simulated-device-07-telemetry.png` | L — physical-format distance telemetry |
| `simulated-device-08-program-running-physical-target.png` | M — deployed program running on the physical target |
| `simulated-device-09-handshake-failed.png` | P — a port without the firmware fails the handshake |
| `simulated-device-10-link-lost-fault.png` | P — link lost while moving; fault latched |
| `simulated-device-11-emergency-stopped.png` | P — top-bar emergency stop latched |
| `simulated-device-12-build-history-hardware.png` | Build History with hardware events |
| `simulated-device-13-calibration-saved.png` | Calibration saved and reloaded |
| `simulated-device-layout-900.png`, `simulated-device-layout-600.png` | Layout at 900 px and 600 px |
