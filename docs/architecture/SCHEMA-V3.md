# Robot Configuration Schema v3

Status: current since Phase 3. Types: `src/types/project.ts`, `src/types/scene.ts`, `src/types/joint.ts`, `src/types/actuator.ts`. Migration: `src/features/robot-model/schema.ts`. Previous version: `SCHEMA-V2.md`.

## What changed from v2

v3 adds two lists to a robot project: **actuators** (what makes a joint move) and **controllers** (how several actuators work together, for example a differential drive). Components and joints are unchanged.

## Shape

```ts
RobotProject {
  id, name, category, templateId,
  schemaVersion: 3,
  objects: SceneObject[],          // components (unchanged from v2)
  joints: RobotJoint[],            // joints (unchanged from v2)
  actuators: RobotActuator[],      // NEW in v3
  controllers: RobotController[],  // NEW in v3
  createdAt, updatedAt, savedAt,
}

RobotActuator {
  id, name,
  type: 'dcMotor' | 'servo' | 'jointActuator',
  componentId: string | null,      // the motor part that drives the joint (required for DC motor and servo)
  jointId: string,                 // the joint it drives; one actuator per joint
  controlMode: 'velocity' | 'position',
  maxTorque: number,               // N·m (revolute) or N (prismatic); stored for Phase 5 physics
  maxVelocity: number,             // rad/s (revolute) or m/s (prismatic)
  enabled: boolean,
  target: number,                  // last commanded target (runtime value is not saved)
  commandState: 'idle' | 'moving' | 'holding' | 'disabled' | 'error',
  metadata: { description, createdAt },
}

DifferentialDriveController {
  id, type: 'differentialDrive', name,
  rootComponentId: string,         // the top-level part that moves (for example the chassis)
  leftJointId: string,             // revolute wheel joint on the left (−Z side)
  rightJointId: string,            // revolute wheel joint on the right (+Z side)
  wheelRadius: number | null,      // meters; null = measured from the wheel part
  trackWidth: number | null,       // meters; null = measured from the joint origins
  maxLinearSpeed: number,          // m/s at 100 % speed (default 0.5)
  maxAngularSpeed: number,         // rad/s at 100 % speed (default 2)
}
```

## Actuator types

| Type | Joints | Control mode | Motor part | Default max torque / velocity |
| --- | --- | --- | --- | --- |
| DC Motor | revolute | velocity (continuous spin) | required (motor category) | 0.5 N·m / 20 rad/s |
| Servo | revolute | position (within limits) | required (motor category) | 1.5 N·m / 5 rad/s |
| Generic Joint Actuator | revolute or prismatic | position | optional | 10 / 2 |

Validation (`features/robot-model/actuators.ts`): fixed joints cannot have an actuator; one actuator per joint; the joint type must suit the actuator type; a referenced part must exist and be a motor; max torque and max velocity must be positive; the control mode must match the type.

Controller validation: the root must be a top-level part; both wheel joints must exist, be revolute and be different; dimensions and speeds must be positive; one drive per root.

## What is NOT saved

Runtime state lives in `robotStateStore` and is never saved or put into undo history: the driven pose of the robot, joint preview positions, actuator runtime values, the current command and the telemetry. Reset returns to the saved design. "Apply pose" is the only way to copy a driven pose into the design, and it is one undo step.

## v2 → v3 migration

- `actuators: []` and `controllers: []` are added; `schemaVersion` becomes 3.
- Projects created from the **Explorer Bot** template (`templateId: 'explorer-bot'`) get two DC motors ("Left Drive Motor", "Right Drive Motor") on the wheel joints and a differential-drive controller, using the same rule as a new Explorer Bot (`autoConfigureDrive`). If the robot was changed so much that this cannot be done, a warning is logged and the lists stay empty; the project still opens.
- Stored actuators that are invalid (for example on a fixed joint) are kept but disabled, and reported as warnings. Nothing is silently deleted.
- Chain: v1 → v2 → v3. A Phase 1 draft goes through both steps.
- The browser store key keeps its name (`arai.projects.v1`); the store's internal version is now 3.

## Coordinate conventions for driving

Y-up, meters, radians. In the root part's frame, **forward = +X**, up = +Y, **left = −Z**. Positive turn rate turns left (counter-clockwise seen from above). The Explorer Bot template was adjusted in Phase 3 so its Left Wheel and Left Motor are on the −Z side.

## Tests

`src/features/robot-model/schemaV3.test.ts`, `actuators.test.ts`, `schema.test.ts`, and the "A schema v2 project is upgraded to v3 and can drive" step in `tests/e2e/control.e2e.mjs`.
