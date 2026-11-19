/**
 * The program API, as seen INSIDE the sandbox. One list drives the editor
 * autocomplete, the hover help and the API list in the side panel, so they
 * can never offer something that does not exist.
 *
 * robotControl mirrors the Phase 3 Robot Control API. Differences inside the
 * sandbox: every call returns a Promise; timed moves and joint targets resolve
 * when the move has finished; rejected commands throw RobotCommandError.
 */
export interface ApiEntry {
  /** Full dotted name, used for completion matching. */
  name: string;
  signature: string;
  description: string;
  /** Text inserted by autocomplete. ${…} marks placeholders. */
  snippet: string;
  group: 'Driving' | 'Joints' | 'Sensors' | 'Robot state' | 'Program';
}

export const API_REFERENCE: readonly ApiEntry[] = [
  { group: 'Driving', name: 'robotControl.drive.forward', signature: 'drive.forward({ speed?, durationMs? })', description: 'Drive forward. speed 0 … 1 (default 1, scaled by the speed setting). With durationMs, resolves when the time is up; without it, keeps driving.', snippet: 'robotControl.drive.forward({ speed: ${0.5}, durationMs: ${1000} })' },
  { group: 'Driving', name: 'robotControl.drive.backward', signature: 'drive.backward({ speed?, durationMs? })', description: 'Drive backward. Same options as forward.', snippet: 'robotControl.drive.backward({ speed: ${0.5}, durationMs: ${1000} })' },
  { group: 'Driving', name: 'robotControl.drive.set', signature: 'drive.set(speed)', description: 'Keep driving at speed −1 … 1. 0 releases forward/backward motion.', snippet: 'robotControl.drive.set(${0.5})' },
  { group: 'Driving', name: 'robotControl.turn.left', signature: 'turn.left({ rate?, durationMs? })', description: 'Turn left. rate 0 … 1 (default 1). With durationMs, resolves when the time is up.', snippet: 'robotControl.turn.left({ rate: ${0.5}, durationMs: ${1000} })' },
  { group: 'Driving', name: 'robotControl.turn.right', signature: 'turn.right({ rate?, durationMs? })', description: 'Turn right. Same options as left.', snippet: 'robotControl.turn.right({ rate: ${0.5}, durationMs: ${1000} })' },
  { group: 'Driving', name: 'robotControl.turn.set', signature: 'turn.set(rate)', description: 'Keep turning: −1 (right) … 1 (left). 0 releases turning. Combine with drive.set for an arc.', snippet: 'robotControl.turn.set(${0.3})' },
  { group: 'Driving', name: 'robotControl.stop', signature: 'stop()', description: 'Stop all movement immediately.', snippet: 'robotControl.stop()' },
  { group: 'Driving', name: 'robotControl.reset', signature: 'reset()', description: 'Stop and return the robot to its design pose.', snippet: 'robotControl.reset()' },
  { group: 'Driving', name: 'robotControl.setSpeedPercent', signature: 'setSpeedPercent(percent)', description: 'The speed setting, 0 … 100 % (like the control panel slider).', snippet: 'robotControl.setSpeedPercent(${50})' },
  { group: 'Joints', name: 'robotControl.joint', signature: 'joint(jointId).setTarget(target) / .preview(target)', description: 'setTarget moves a joint with its position actuator and resolves when it arrives. preview jumps there (kinematic preview). Radians or meters, within the joint limits.', snippet: 'robotControl.joint(${"jointId"}).setTarget(${0.5})' },
  { group: 'Joints', name: 'robot.joints', signature: 'robot.joints()', description: 'List the movable joints: id, name, type, lower, upper, hasActuator.', snippet: 'robot.joints()' },
  { group: 'Joints', name: 'robot.jointInfo', signature: 'robot.jointInfo(jointId)', description: 'Position, limits and whether the joint is moving.', snippet: 'robot.jointInfo(${"jointId"})' },
  { group: 'Joints', name: 'robot.waitForJoint', signature: 'robot.waitForJoint(jointId)', description: 'Resolve when the joint has finished moving.', snippet: 'robot.waitForJoint(${"jointId"})' },
  { group: 'Sensors', name: 'robotSensors.list', signature: 'robotSensors.list()', description: 'The robot\'s sensors: id, type (distance, encoder, imu), name, enabled, rateHz.', snippet: 'robotSensors.list()' },
  { group: 'Sensors', name: 'robotSensors.distance', signature: 'robotSensors.distance(id).read() / .meters() / .isObstacleDetected(maxMeters?) / .subscribe(fn) / .waitForReading()', description: 'Distance sensor (Physics engine). read() gives distance (m, or null for no hit), detected, status, hitPoint, rays, valid. meters(): Infinity when nothing is in range.', snippet: 'robotSensors.distance(${"front-distance"}).read()' },
  { group: 'Sensors', name: 'robotSensors.encoder', signature: 'robotSensors.encoder(id).read() / .value(field) / .reset() / .subscribe(fn)', description: 'Wheel encoder: angle (rad, continuous), angleDelta, angularVelocity, revolutions, ticks, distance (m). Driving forward counts up on default sensors.', snippet: 'robotSensors.encoder(${"left-encoder"}).read()' },
  { group: 'Sensors', name: 'robotSensors.imu', signature: 'robotSensors.imu(id).read() / .orientation(roll|pitch|yaw) / .angularVelocity(axis) / .linearAcceleration(axis) / .specificForce(axis)', description: 'IMU: orientation (quaternion and roll/pitch/yaw), angular velocity (rad/s), linearAcceleration (m/s², gravity removed), specificForce (what an accelerometer reads).', snippet: 'robotSensors.imu(${"main-imu"}).read()' },
  { group: 'Sensors', name: 'robotSensors.odometry', signature: 'robotSensors.odometry()', description: 'Position and heading estimated from the two drive-wheel encoders. An estimate: it drifts from the true pose over time.', snippet: 'robotSensors.odometry()' },
  { group: 'Robot state', name: 'robotControl.getState', signature: 'getState()', description: 'Snapshot: movement (status, intent, twist, distance, lastError), speedPercent, rootPoses, jointPositions.', snippet: 'robotControl.getState()' },
  { group: 'Program', name: 'wait', signature: 'wait(ms)', description: 'Wait 0 … 60000 ms. Pause-aware.', snippet: 'wait(${1000})' },
  { group: 'Program', name: 'console.log', signature: 'console.log(...values)', description: 'Write to the Program console (also console.warn, console.error, print).', snippet: 'console.log(${"message"})' },
  { group: 'Program', name: 'print', signature: 'print(...values)', description: 'Same as console.log.', snippet: 'print(${"message"})' },
];

export function findApiEntry(name: string): ApiEntry | undefined {
  return API_REFERENCE.find((e) => e.name === name);
}
