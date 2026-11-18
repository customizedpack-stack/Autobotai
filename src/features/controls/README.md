# Robot Controls (Phase 3 — active)

Owns driving and joint motion. Everything here talks through connector **C2 Command Bus** (see `docs/architecture/C2-COMMAND-BUS.md`).

| File | Role |
| --- | --- |
| `commands.ts` | Command types and pure validation |
| `commandBus.ts` | `submitCommand`, bus events, `connectCommandBus` |
| `movementEngine.ts` | 60 Hz fixed-step kinematic engine (outside React) |
| `differentialDrive.ts` | Wheel-speed math, speed limiting, exact arc integration |
| `robotControlApi.ts` | `robotControl` — the high-level API for code and AI |
| `controlSession.ts` | Build/Control mode switching, Apply pose, session cleanup |
| `keyboardControls.ts` | Held-key handling and the typing exclusion |

Runtime state lives in `src/stores/robotStateStore.ts` and is never saved.
