# Sensor Simulation (Phase 6)

Three simulated sensors: a distance sensor, wheel encoders and an IMU. Every reading comes from the actual simulation state. Nothing is random, and nothing is taken from key presses or motor requests. The stream that carries the readings is described in `C3-SENSOR-STREAM.md`.

## Units and conventions

- Meters, radians, seconds; Y is up; on the robot, forward is +X and left is −Z (same as the drive).
- A sensor's mount pose is its part's pose, then the mount **position** (meters, in the part frame without scale) and **rotation** (Euler XYZ, like part transforms).

## Sources

| | Physics engine | Kinematic engine |
| --- | --- | --- |
| Part pose | Rapier body pose × the part's pose in its link | The kinematic runtime pose (driven root + joint positions), as drawn |
| Velocities | Rapier `velocityAtPoint`, `angvel` | Computed by the sensor from successive poses |
| Joint angle | `jointPosition` (twist decomposition, wraps at ±π) | Kinematic joint position |
| Ray casts | Rapier `castRayAndGetNormal` | Not available |
| Gravity | (0, −9.81, 0) or (0, 0, 0) when switched off | (0, −9.81, 0) |

## Distance sensor

- Looks along its local **+X**. With `rays > 1`, rays are spread evenly across `fov` in the sensor's XZ plane, from left (+angle) to right.
- **Physics-world ray casts** (`castRayAndGetNormal`, solid). Collision groups: the ray belongs to the robot group and only tests the environment group, so **the robot's own parts are never hit**. With `ignoreGround` (default), objects in the GROUND collision group are excluded: the default floor and every Environment Editor object of kind "ground" (Phase 7). Walls, boxes, platforms, ramps and obstacles from the Environment Editor are in the ENVIRONMENT group and are always hit, including dynamic ones that move. Static obstacles are hit. Other robots would be hit too, but a project holds one robot today.
- **No hit** within `maxRange`: `distance: null`, `detected: false`, `status: "no-hit"`. **Never 0.**
- Hit closer than `minRange`: `status: "too-close"`, `detected: true`, `distance: null`.
- Aggregate for several rays: `distance` = nearest valid hit; `status` is "too-close" if any ray is too close, else "hit" if any ray hit; `rays[]` lists every ray (angle, world direction, distance, status, hit point and normal). The aggregate `hitPoint` and `hitNormal` come from the nearest valid hit; when no ray has a valid hit but one is too close, they come from that too-close ray (Phase 7), so the ray drawing still shows where the obstacle is.
- Kinematic engine: `valid: false`, error "The distance sensor needs the Physics engine…".
- Invalid mount pose (not a finite number) or a missing part: `valid: false` with a clear error.
- This is a **multi-ray distance sensor**, not a LiDAR (no 360° scan, no point cloud).
- Defaults: 1 ray, 0.02 … 4 m, 20 Hz, ground ignored.

## Wheel encoders

- Read the **actual** wheel joint angle every tick and add up the wrapped change, so the count is continuous over any number of revolutions (one tick covers less than π at any realistic wheel speed).
- **Direction:** positive = the joint's positive rotation about its axis; `invert` flips it. The default sensors set `invert` so that **driving forward counts up** on both wheels.
- Reading: `angle` (rad since reset, continuous), `angleDelta` (since the previous reading), `angularVelocity` (measured, rad/s), `revolutions`, `ticks` = trunc(revolutions × ticksPerRevolution), `distance` (angle × wheel radius, for drive wheels).
- **Reset** sets the counter to 0 at the current angle (runtime only). A simulation Reset also restarts the counters.
- A missing or non-revolute joint: refused when configured (C1), or `valid: false` with an error at run time.
- Defaults: 360 ticks per revolution, 60 Hz.

### Odometry (estimate)

From the two drive-wheel encoders: left and right rolled distance, mean distance, heading change (dR − dL) / track width, and an x/z position integrated from the start pose. It is shown as **"Odometry (estimate)"** and offered as `robotSensors.odometry()`. It **never replaces the physics pose**: wheel slip, contact jitter and numerical integration make it drift away from the true position over time, which is exactly the difference between measured odometry and ground truth.

## IMU

- **Orientation:** the sensor's world rotation (quaternion, sensor → world) plus roll (about X), pitch (about Z) and yaw (about Y, positive = turning left).
- **Angular velocity:** the body's angular velocity (physics) or the rotation between samples / time (kinematic), in rad/s.
- **Acceleration:** (velocity of the sensor point now − at the previous sample) / simulated time between the samples, which is a whole number of 1/60 s ticks.
  - `linearAcceleration` — gravity **not** included. Reads 0 when the robot rests.
  - `specificForce` — what a real accelerometer measures: acceleration − gravity. Reads about **+9.81 m/s² up** when the robot rests, about 0 with gravity switched off.
- **Frame:** `sensor` (default: vectors in the IMU's own axes) or `world`.
- **Warm-up (corrected 19 Nov 2026).** Acceleration is never invented:
  - **Physics:** velocity is measured from the rigid body, so acceleration needs **2 samples**. Sample 1 is warming up; sample 2 is the first valid acceleration.
  - **Kinematic:** velocity itself comes from two poses, so acceleration needs **3 samples**. Sample 1 has a pose only, sample 2 the first velocity, sample 3 the first valid acceleration.
  - While warming up, the reading is `valid: false` with `error: "Warming up: acceleration needs N samples (k so far)."` and the acceleration fields are 0 placeholders, not measurements.
  - The one exception is an **at-rest** sample. The manager requests one only while the kinematic engine is not stepping, so the robot provably stands still. Zero velocity and zero acceleration are then the actual kinematic state, so the reading is valid.
  - `reset()` clears the previous pose, the previous velocity and the sample count on start, Reset, rebuild and jumps, so no spike can come from an old history.
  - The kinematic engine changes speed instantly. The first moving sample after a standstill therefore shows one large acceleration (speed change ÷ one tick). That value is the kinematic motion itself, not an artifact of initialization.
- Defaults: on the IMU part, or on the drive's root part; 60 Hz.

## Configuration and storage

- Saved in the optional project field `sensors` (schema v3 unchanged; see `SCHEMA-V3.md`). Only configuration is saved, never readings.
- Changes go through C1 (`robotModel.addSensor / updateSensor / removeSensor / addDefaultSensors`): validated, one undo step each. Removing a part or joint removes its sensors in the same step (undo restores both).
- New Explorer Bots get `front-distance`, `left-encoder`, `right-encoder` and `main-imu`. Older projects are not changed; "Add default sensors" adds them on request.

## Code Studio API

JavaScript (`robotSensors`, separate from `robotControl`, which is unchanged):

```js
const d = await robotSensors.distance("front-distance").read();      // full reading
const m = await robotSensors.distance("front-distance").meters();    // Infinity when nothing is in range
const near = await robotSensors.distance("front-distance").isObstacleDetected(0.3);
const e = await robotSensors.encoder("left-encoder").read();          // .value("ticks"), .reset()
const yaw = await robotSensors.imu("main-imu").orientation("yaw");    // .angularVelocity("y"), .linearAcceleration("x"), .specificForce("y")
const sub = await robotSensors.imu("main-imu").subscribe((r) => console.log(r.angularVelocity.y), { maxHz: 10 });
await sub.unsubscribe();
await robotSensors.distance("front-distance").waitForReading();
const all = await robotSensors.list();
const odo = await robotSensors.odometry();
```

- `read()` resolves with the reading; a **disabled** sensor resolves with `valid: false, error: "Sensor is disabled."`. `meters()`, `value()`, `orientation()` and similar helpers wait briefly while a sensor warms up, then throw `RobotCommandError` with the sensor's reason when the reading is invalid.
- Unknown ids and wrong types throw clear errors (`This robot has no sensor "x". Sensors: …`, `"main-imu" is an IMU, not a distance sensor.`).
- Stale readings carry `stale: true`.
- An active subscription keeps the program running (like a pending timer) until `unsubscribe()`; Stop and every other end of the run remove all subscriptions on the host.

Blockly: the **Sensors** category (15 blocks) — distance in meters, obstacle detected, obstacle closer than, compare distance, wait until distance, read distance/encoder/IMU, encoder angle/revolutions/ticks/speed/distance, reset encoder, IMU heading/pitch/roll, turn rate, acceleration, wait for a new reading, reading is valid. They generate `robotSensors` calls only. Dropdowns list the robot's sensors; a deleted sensor stays visible as "missing" and stops the program before it runs. A "subscribe" block is not offered because block programs run step by step; "wait until distance …" covers the same need.

## Security (sandbox)

All requests pass the host bridge: message kind and session (existing checks), operation allowlist (six new read-only operations), argument types and size (existing), sensor id pattern and existence, sensor type, **project identity** (a run is tied to the project it started in), **subscription ownership** (per run), and limits: 200 sensor reads per second, 8 subscriptions per run, 20 deliveries per second per subscription (the newest reading wins). While a program is paused, no reading is delivered. The general 1,000 / 5,000 messages-per-second protection still applies to everything the worker sends.
