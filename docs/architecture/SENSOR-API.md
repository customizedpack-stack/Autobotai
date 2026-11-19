# Sensor API (Phase 6)

The only way user programs reach sensors. Programs call `robotSensors` inside the sandbox; every request travels as an allowlisted message to the host, where a per-run `SandboxSensorBridge` (`src/features/sensors/api/sandboxSensorBridge.ts`) checks it and calls the host sensor API (`src/features/sensors/api/sensorApi.ts`). Programs receive plain data copies only — never Rapier objects, stores or the stream. Full sensor semantics: `SENSOR-SIMULATION.md`; the stream: `C3-SENSOR-STREAM.md`.

## Operations

| Program call | Sandbox operation | Kind | Limit |
| --- | --- | --- | --- |
| `robotSensors.list()` | `sensor.list` | read | 200 reads / s per run |
| `robotSensors.<type>(id).read()` and the helpers (`meters()`, `value()`, `orientation()`, …) | `sensor.read` | read | 200 reads / s per run |
| `robotSensors.odometry()` | `sensor.odometry` | read | 200 reads / s per run |
| `.subscribe(fn, { maxHz })` | `sensor.subscribe` | subscription | 8 per run; ≤ 20 deliveries / s each |
| `subscription.unsubscribe()` | `sensor.unsubscribe` | subscription | — |
| `robotSensors.encoder(id).reset()` | `sensor.resetEncoder` | **state change** | **10 resets / s per run** |

Sensor operations never move the robot, so they are answered while the program is paused and are not counted against the 30 robot commands per second. The general message protection (1,000 messages / s rejected, 5,000 / s ends the run) applies to everything the worker sends.

## Checks on every request

1. Message kind and execution session (the host ignores messages from ended or replaced runs before they reach the bridge).
2. Operation allowlist and argument types and sizes (`messageProtocol.ts`).
3. The run is still alive (a disposed bridge answers "The program is no longer running.").
4. **Project identity:** a run is tied to the project it started in; after another project opens, every call is refused with "The robot project changed. Run the program again." and changes nothing.
5. Sensor id pattern, existence and type ("This robot has no sensor …", "… is an IMU, not a distance sensor.").
6. The rate limits above. Rejected requests change nothing.
7. Subscriptions belong to the run that created them; Stop, finishing, errors and worker termination end all of them.

## Encoder reset rate protection (corrected 19 Nov 2026)

`sensor.resetEncoder` changes sensor state, so it has its **own** limit, separate from reads:

- `maxEncoderResetsPerSecond` in `ExecutionLimits` (default **10**), counted in a sliding one-second window **per execution session** (per `SandboxSensorBridge`).
- Above the limit the request is rejected with `SensorApiError: Too many encoder resets: the limit is 10 per second. Reset once, then read the encoder.` In a program, the call throws `RobotCommandError` with the same message.
- Reads (`read()`, `value()`, …) are not counted against it and keep working.
- A new run gets a new bridge and therefore fresh counters; an ended run's bridge refuses everything; an old run cannot reset encoders in a newly opened project.
- Stop while reset requests are pending ends the run cleanly: the bridge is disposed, subscriptions end, nothing is left behind, and the next run can reset normally.

Tests: `src/features/sensors/tests/encoderResetLimit.test.ts`, `sensorApi.test.ts`.
