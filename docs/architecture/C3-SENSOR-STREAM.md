# C3 — Sensor Stream (Phase 6)

## Naming

In the master build plan, connector **C3 is the Sensor Stream**, and that is what this document describes. The Phase 4 and Phase 5 briefs used "C3" for Code Studio; `C3-CODE-STUDIO.md` explains that Code Studio is a *module*, not a connector (its robot traffic travels over **C2**), and it is kept unchanged so both names still lead to the right place.

| Term | Meaning | Where |
| --- | --- | --- |
| **C3 Sensor Stream** | Sensor readings and sensor lifecycle events | `src/features/sensors/` (this document) |
| C3 Code Studio (brief term) | The programming module | `src/features/code-studio/`, see `C3-CODE-STUDIO.md` |

## What flows on C3

```
Rapier world (Physics)  or  kinematic runtime pose (Kinematic)
        │   read-only SensorSource
        ▼
Sensor manager ── sampled from the engine's own step (no new loop)
        │   publish(reading)
        ▼
Sensor stream ── latest value + bounded history (120) per sensor, subscriptions
        ├── Workspace UI snapshot (sensorStore, ≤ 10 updates per second)
        │       ├── Sensor Monitor tab, Robot Control "Sensors", Inspector
        │       └── Viewport ray view (reads latest readings once per frame)
        └── Code Studio: SandboxSensorBridge per program run
                └── worker: robotSensors (JavaScript) and the Sensors blocks (Blockly)
```

**Readings** travel through the stream only. At up to 60 Hz per sensor they would flood the Connector Bus and its Bus Events panel, so the bus carries **lifecycle events** only:

| Bus channel | Payload |
| --- | --- |
| `sensor.stream` | `state` (off, running, paused), `source` (physics, kinematic), `session`, `sensors` |
| `sensor.event` | `sensorId`, `sensorType`, `event` (started, stopped, enabled, disabled, error, recovered, reset), `timestamp`, `session`, `source`, `valid`, `reading` (latest or null), `detail` |
| `robotModel.sensorChanged` | Configuration changes through C1: added, updated, removed |

No second general-purpose bus was added.

## Stream API (`stream/sensorStream.ts`)

| Method | Purpose |
| --- | --- |
| `publish(reading)` | Only the sensor manager calls it. Stores the latest value and the history, and calls listeners. A failing listener never stops the others. |
| `subscribe(id or '*', listener)` | Returns an unsubscribe function (safe to call twice). |
| `latest(id)`, `history(id)` | Latest reading; up to 120 previous readings (ring buffer, never grows). |
| `clear(id?)` | Forget readings (used when the stream stops). |

## Reading format (every type)

| Field | Meaning |
| --- | --- |
| `sensorId`, `type` | Which sensor |
| `timestamp` | Host clock of the sample (ms, `performance.now()`) |
| `simTime` | Simulated seconds since the stream started |
| `source` | `physics` or `kinematic` |
| `valid` | False when the value cannot be trusted; `error` says why |
| `stale` | True while the physics simulation is paused, or when the reading is older than two sample periods while the engine runs |
| `sequence` | Increases with every sample of this sensor |

Type-specific fields are in `SENSOR-SIMULATION.md`.

## Lifecycle rules

- The stream runs while **Control Mode or Code Studio** is open: with the **Kinematic** engine at once, with the **Physics** engine while the simulation is running or paused.
- **Physics paused:** no ticks, so no new readings; readings are marked stale; the stream state is `paused`.
- **Physics stopped, Build Mode, project closed:** the source is detached, readings are cleared, every enabled sensor reports `stopped`. Nothing keeps sampling.
- **Engine switch:** the old source is detached before the new one is attached. There is never more than one source.
- **Reset / rebuild** (C2 reset, environment change, simulation start): encoder counters go back to 0, IMU and odometry histories restart, `reset` events are published.
- **Disabled sensor:** no samples; one invalid reading with `error: "Sensor is disabled."`.
- **No duplicate registrations:** runtimes are keyed by sensor id, and ids are unique per project (validated by C1).

## Sampling and performance

- No sensor loop exists. `simulationManager` calls `tick(1/60)` after each physics tick, and the kinematic movement engine calls it after each kinematic step (step observer). Each sensor is sampled when its next sample time is reached in simulated time, so 10, 20, 30 and 60 Hz are exact divisions of the 60 Hz tick.
- Encoders integrate the wheel angle on every tick; the other sensors only work when they are due.
- The UI snapshot is refreshed at most 10 times per second; the viewport reads readings directly once per frame without React updates.
- Measured (Node, unit test): 5 s of physics took 166 ms without sensors and 173 ms with a 15-ray scanner at 60 Hz, two encoders and an IMU (4,500 ray casts).
