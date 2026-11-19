# Sensors (Phase 6) — C3 Sensor Stream

Distance sensor (Rapier ray casts), wheel encoders and an IMU, sampled from the existing
simulation step and published on the C3 Sensor Stream.

- `config/` validation, defaults, load-time cleanup
- `core/` reading types, mount math, sensor manager (lifecycle and sampling), UI store
- `stream/` the stream (latest value, bounded history, subscriptions)
- `distance/`, `encoders/`, `imu/` the sensor models
- `sources/` read-only views of the physics world and of the kinematic pose
- `api/` host-side sensor API and the per-run sandbox bridge
- `components/` inspector, Sensor Monitor, Robot Control readings, viewport rays

See `docs/architecture/C3-SENSOR-STREAM.md` and `docs/architecture/SENSOR-SIMULATION.md`.
