/**
 * The six Phase 11 learning projects.
 *
 * Every status below was checked against the code (see docs/phase-11/PROJECT-LIBRARY.md):
 * - Distance sensing needs the Physics engine. Encoders, IMU and odometry are simulation only.
 * - Cameras give an image, brightness and mean color. There is NO object recognition.
 * - There is NO line sensor (simulation or hardware) and NO grasping physics for grippers.
 * - Physical deployment exists only for the Explorer Bot reference profile (Phase 10), which
 *   was tested with the simulated device only. Physical programs may drive and read the
 *   front distance sensor; encoders, IMU, odometry and cameras are refused on hardware.
 */
import { PROJECT_DEFINITION_VERSION, type Capability, type ProjectDefinition, type RequiredComponent, type RequiredPart } from '../model/types';

const EXPLORER_COMPONENTS: RequiredComponent[] = [
  { componentId: 'chassis-rect', label: 'Rectangular Chassis', count: 1, role: 'Holds every other part together.' },
  { componentId: 'wheel-standard', label: 'Standard Wheel', count: 2, role: 'Drive wheels: turning them at different speeds steers the robot.' },
  { componentId: 'motor-dc', label: 'DC Motor', count: 2, role: 'One motor per drive wheel.' },
  { componentId: 'wheel-caster', label: 'Caster Ball', count: 1, role: 'Passive third contact point that keeps the robot level.' },
  { componentId: 'sensor-distance', label: 'Distance Sensor', count: 1, role: 'Measures how far the nearest object in front is.' },
  { componentId: 'other-controller', label: 'Controller Board', count: 1, role: 'Runs the robot program.' },
];

/** Phase 10 reference parts (docs/hardware/EXPLORER-BOT-REFERENCE-HARDWARE.md). */
const EXPLORER_PARTS: RequiredPart[] = [
  { partId: 'espressif-esp32-devkitc-v4', quantity: 1, role: 'Controller' },
  { partId: 'pololu-713', quantity: 1, role: 'Motor driver' },
  { partId: 'pololu-1101', quantity: 2, role: 'Drive motors' },
  { partId: 'pololu-1429', quantity: 1, role: 'Wheels (one pair)' },
  { partId: 'pololu-989', quantity: 1, role: 'Motor brackets (one pair)' },
  { partId: 'pololu-951', quantity: 1, role: 'Ball caster' },
  { partId: 'pololu-2490', quantity: 1, role: 'Distance sensor' },
];

const cap = (id: string, label: string, status: Capability['status'], note: string): Capability => ({ id, label, status, note });

const DRIVE_SIM = cap('drive', 'Differential drive', 'supported', 'Works in the Kinematic and Physics engines (Control Mode and Code Studio).');
const DISTANCE_SIM = cap('distance', 'Distance sensing', 'supported', 'Ray-cast distance sensor. Needs the Physics engine (Simulate).');
const ENCODER_SIM = cap('encoders', 'Wheel encoders and odometry', 'simulation-only', 'Simulated in both engines. The reference hardware has no encoders.');
const CAMERA_SIM = cap('camera', 'Camera image', 'simulation-only', 'Image, brightness and mean color. There is no object recognition.');
const EXPLORER_BUILD = cap('build-guide', 'Parts, wiring and build guide', 'build-guide', 'Robot Blueprint with verified Explorer Bot reference parts (Phase 9 and 10).');
const EXPLORER_DEPLOY = cap(
  'deployment',
  'Run on a real ESP32 Explorer Bot',
  'hardware-deployment',
  'Phase 10 reference profile only, over USB. Tested with the simulated device only; the firmware was not compiled or run on a real ESP32 by AutoBotAI.',
);
const EXPLORER_CONFIG = cap('configuration', 'Hardware setup', 'requires-configuration', 'You must enter your battery, add and confirm a motor-power switch, and apply the firmware pin map before arming.');

export const PROJECT_DEFINITIONS: readonly ProjectDefinition[] = [
  {
    id: 'obstacle-avoidance',
    version: PROJECT_DEFINITION_VERSION,
    name: 'Obstacle Avoidance Robot',
    slug: 'obstacle-avoidance-robot',
    purpose: 'Drive around a room without bumping into things.',
    summary: 'A two-wheel robot that drives forward and turns away when its distance sensor sees something close.',
    description:
      'This is the classic first robot. It reads one distance sensor many times a second and makes a simple decision each time: keep driving when the way is clear, turn when an obstacle is close.',
    realWorldUse: 'Robot vacuum cleaners and warehouse carts use the same idea (with more sensors) to avoid walls, furniture and people.',
    howItWorks: [
      'The distance sensor at the front measures how far away the nearest object is.',
      'The program compares that distance with a safety limit (35 cm in the starter program).',
      'Clear way: both wheels turn forward. Obstacle: the wheels turn in opposite directions, so the robot turns in place.',
    ],
    difficulty: 'beginner',
    category: 'mobile',
    templateId: 'explorer-bot',
    learningObjectives: [
      'Name the parts of a differential-drive robot and what each one does.',
      'Read a distance sensor from a program.',
      'Write an if/else decision inside a loop.',
      'Test a program in the Physics simulation with real obstacles.',
    ],
    requiredComponents: EXPLORER_COMPONENTS,
    requiredSensors: ['distance'],
    requiredActuators: ['Two DC motors (differential drive)'],
    requiredController: 'Differential-drive controller on the two wheel joints (created automatically for Explorer Bot).',
    simulationCapabilities: [DRIVE_SIM, DISTANCE_SIM],
    physicalRequirements: [EXPLORER_BUILD, EXPLORER_DEPLOY, EXPLORER_CONFIG],
    parts: EXPLORER_PARTS,
    tutorialId: 'tutorial-obstacle-avoidance',
    expectedResult: 'In the Obstacle Course environment the robot drives forward and turns away before touching the wall and blocks.',
    successCriteria: ['The robot has a working differential drive.', 'The program reads the front distance sensor.', 'The program finished a run in the Physics engine.', 'You saw the robot turn before reaching an obstacle (manual check).'],
    setup: {
      environmentId: 'obstacles',
      program: {
        name: 'Obstacle Avoidance',
        description: 'Drive forward; turn left when something is closer than 35 cm. Run it with Simulate (Physics engine).',
        source: [
          '// Obstacle avoidance: drive forward, turn away when something is close.',
          '// The distance sensor needs the Physics engine: click Simulate before Run.',
          'const sensor = robotSensors.distance("front-distance");',
          'const SAFE_DISTANCE = 0.35; // meters',
          '',
          'for (let i = 0; i < 40; i++) {',
          '  const reading = await sensor.read();',
          '  if (reading.valid && reading.distance !== null && reading.distance < SAFE_DISTANCE) {',
          '    print("Obstacle at", reading.distance.toFixed(2), "m: turning left");',
          '    await robotControl.turn.left({ rate: 0.6, durationMs: 600 });',
          '  } else {',
          '    await robotControl.drive.forward({ speed: 0.5, durationMs: 250 });',
          '  }',
          '}',
          'robotControl.stop();',
          'print("Done");',
          '',
        ].join('\n'),
      },
    },
    keywords: ['avoid', 'obstacle', 'obstacles', 'bump', 'collision', 'wall', 'walls', 'room', 'drive', 'roam', 'explore', 'vacuum', 'clean', 'navigate', 'distance', 'first', 'simple', 'beginner'],
    environments: ['indoor', 'warehouse'],
  },
  {
    id: 'line-following',
    version: PROJECT_DEFINITION_VERSION,
    name: 'Line Following Robot',
    slug: 'line-following-robot',
    purpose: 'Follow a dark line on the floor.',
    summary: 'Learn how line followers steer. AutoBotAI has no line sensor yet, so you practice the path and the steering logic with timed moves.',
    description:
      'A real line follower looks down at the floor with two or more reflectance sensors and steers toward the side that sees the line. AutoBotAI does not simulate a line sensor yet, so this project teaches the drive and the steering logic, and says clearly what is missing.',
    realWorldUse: 'Factory and hospital carts follow taped or painted lines to move goods along a fixed route.',
    howItWorks: [
      'Reflectance sensors under the robot see whether the floor below is dark (line) or light.',
      'If the line drifts to the left sensor, the robot turns left a little; if it drifts right, it turns right.',
      'In AutoBotAI today you practice the route with timed moves, because there is no line sensor.',
    ],
    difficulty: 'beginner',
    category: 'mobile',
    templateId: 'explorer-bot',
    learningObjectives: ['Explain how a line follower steers with two sensors.', 'Drive a planned route with timed moves.', 'Recognize when a feature is not supported and what would be needed.'],
    requiredComponents: EXPLORER_COMPONENTS.filter((c) => c.componentId !== 'sensor-distance'),
    requiredSensors: [],
    requiredActuators: ['Two DC motors (differential drive)'],
    requiredController: 'Differential-drive controller on the two wheel joints.',
    simulationCapabilities: [DRIVE_SIM, cap('line-sensor', 'Line detection', 'not-yet-supported', 'There is no line (reflectance) sensor in the simulation or the hardware profile.')],
    physicalRequirements: [
      cap('line-sensor-hw', 'Line sensor hardware', 'not-yet-supported', 'No reflectance sensor is in the verified parts catalog or the firmware.'),
      cap('build-guide', 'Drive base build guide', 'build-guide', 'The Explorer Bot drive base can be planned in the Robot Blueprint; the line sensor is missing.'),
    ],
    parts: EXPLORER_PARTS.filter((p) => p.partId !== 'pololu-2490'),
    tutorialId: 'tutorial-line-following',
    expectedResult: 'The robot drives a square route with timed moves. Real line following is not possible yet.',
    successCriteria: ['The robot has a working differential drive.', 'The route program finished a run.', 'You can explain what a line sensor would add (manual check).'],
    setup: {
      environmentId: 'floor',
      program: {
        name: 'Line Route Practice',
        description: 'No line sensor exists yet: this drives the square route a line follower would follow, using timed moves.',
        source: [
          '// Line Following practice. AutoBotAI has no line sensor yet, so this program',
          '// drives the square route with timed moves instead of following a real line.',
          'for (let side = 0; side < 4; side++) {',
          '  print("Side", side + 1);',
          '  await robotControl.drive.forward({ speed: 0.5, durationMs: 1500 });',
          '  await robotControl.turn.right({ rate: 0.5, durationMs: 900 }); // about a quarter turn',
          '}',
          'robotControl.stop();',
          'print("Route finished");',
          '',
        ].join('\n'),
      },
    },
    keywords: ['line', 'lines', 'track', 'tape', 'follow', 'following', 'path', 'route', 'floor', 'factory'],
    environments: ['indoor', 'warehouse'],
  },
  {
    id: 'pick-and-place-arm',
    version: PROJECT_DEFINITION_VERSION,
    name: 'Pick & Place Robot Arm',
    slug: 'pick-and-place-robot-arm',
    purpose: 'Move an arm through a pick position and a place position.',
    summary: 'A three-joint arm with a gripper. You add position actuators to its joints and program a pick-and-place motion.',
    description:
      'Robot arms are built from links connected by rotating joints. Each joint gets a motor that moves it to an exact angle. A pick-and-place program moves the joints in order: reach, grip, lift, move, release. AutoBotAI moves the joints; it does not simulate grasping, so the gripper does not hold objects yet.',
    realWorldUse: 'Arms like this pack boxes, sort parts and load machines in factories.',
    howItWorks: [
      'The shoulder, elbow and wrist joints each rotate around one axis within their limits.',
      'A position actuator on each joint moves it to the target angle the program asks for.',
      'The program sends targets in sequence to reach the pick spot and the place spot.',
    ],
    difficulty: 'intermediate',
    category: 'arm',
    templateId: 'robotic-arm',
    learningObjectives: ['Explain links, joints and joint limits.', 'Add position actuators to revolute joints.', 'Program a sequence of joint targets.', 'Know the difference between moving a gripper and simulating a grasp.'],
    requiredComponents: [
      { componentId: 'body-cylinder', label: 'Cylinder Body (base)', count: 1, role: 'Fixed base the arm stands on.' },
      { componentId: 'body-box', label: 'Box Body (links)', count: 2, role: 'Upper arm and forearm links.' },
      { componentId: 'joint-revolute', label: 'Revolute Joint markers', count: 3, role: 'Show where the shoulder, elbow and wrist rotate.' },
      { componentId: 'other-gripper', label: 'Gripper', count: 1, role: 'End effector. Visual only: grasping is not simulated.' },
    ],
    requiredSensors: [],
    requiredActuators: ['Position actuator on the Shoulder, Elbow and Wrist joints'],
    requiredController: 'No drive controller; each joint has its own position actuator.',
    simulationCapabilities: [
      cap('joints', 'Joint motion', 'requires-configuration', 'Works once each joint has a position actuator (the template has none; the tutorial adds them).'),
      cap('grasp', 'Picking up objects', 'not-yet-supported', 'The gripper is a visual part; grasping objects is not simulated.'),
    ],
    physicalRequirements: [cap('arm-hw', 'Physical arm parts and deployment', 'not-yet-supported', 'No servos or arm parts are in the verified catalog, and Phase 10 deploys only to the Explorer Bot.')],
    parts: [],
    tutorialId: 'tutorial-pick-and-place-arm',
    expectedResult: 'The arm moves to a pick pose, lifts, swings to a place pose and returns home.',
    successCriteria: ['Every revolute joint has a position actuator.', 'The pick-and-place program finished a run.', 'You saw the arm visit the pick and place poses (manual check).'],
    setup: {
      jointActuators: true,
      program: {
        name: 'Pick and Place',
        description: 'Moves Shoulder, Elbow and Wrist through a pick pose and a place pose. The gripper does not hold objects (no grasp simulation).',
        source: [
          '// Pick and place: move the joints through a pick pose and a place pose.',
          '// Grasping is not simulated, so the gripper does not hold objects.',
          'const joints = await robot.joints();',
          'const find = (name) => joints.find((j) => j.name === name);',
          'const shoulder = find("Shoulder");',
          'const elbow = find("Elbow");',
          'const wrist = find("Wrist");',
          '',
          'async function pose(name, s, e, w) {',
          '  print(name);',
          '  await robotControl.joint(shoulder.id).setTarget(s);',
          '  await robotControl.joint(elbow.id).setTarget(e);',
          '  await robotControl.joint(wrist.id).setTarget(w);',
          '}',
          '',
          'if (!shoulder || !elbow || !wrist) {',
          '  print("This program needs the Shoulder, Elbow and Wrist joints.");',
          '} else if (![shoulder, elbow, wrist].every((j) => j.hasActuator)) {',
          '  print("Add a position actuator to Shoulder, Elbow and Wrist first.");',
          '} else {',
          '  await pose("Reach the pick spot", 0.6, -0.9, 0.4);',
          '  print("Close gripper (visual only)");',
          '  await wait(400);',
          '  await pose("Lift", 0.2, -0.5, 0.2);',
          '  await pose("Move to the place spot", -0.6, -0.9, 0.4);',
          '  print("Open gripper (visual only)");',
          '  await wait(400);',
          '  await pose("Return home", 0, 0, 0);',
          '}',
          '',
        ].join('\n'),
      },
    },
    keywords: ['arm', 'pick', 'place', 'grab', 'grip', 'gripper', 'lift', 'sort', 'pack', 'move objects', 'joint', 'joints', 'manipulator', 'table'],
    environments: ['table', 'indoor', 'warehouse'],
  },
  {
    id: 'delivery-robot',
    version: PROJECT_DEFINITION_VERSION,
    name: 'Delivery Robot',
    slug: 'delivery-robot',
    purpose: 'Carry something a set distance and stop if the way is blocked.',
    summary: 'Drive a measured distance using wheel encoders, wait when something blocks the path, then report the delivery.',
    description:
      'A delivery robot must know how far it has gone and must not drive into people. This project uses the wheel encoders to measure distance and the front distance sensor to pause when the path is blocked.',
    realWorldUse: 'Hospital, hotel and sidewalk delivery robots measure their travel and stop for obstacles in the same way, with many more sensors.',
    howItWorks: [
      'Wheel encoders count wheel rotation; the program turns that into meters traveled.',
      'The distance sensor checks the path ahead; when something is close, the robot waits.',
      'When the measured distance reaches the target, the robot stops and reports the delivery.',
    ],
    difficulty: 'intermediate',
    category: 'mobile',
    templateId: 'explorer-bot',
    learningObjectives: ['Measure distance with wheel encoders.', 'Combine two sensors in one loop.', 'Use a target value to finish a task.', 'Understand why encoder distance is only an estimate.'],
    requiredComponents: EXPLORER_COMPONENTS,
    requiredSensors: ['encoder', 'distance'],
    requiredActuators: ['Two DC motors (differential drive)'],
    requiredController: 'Differential-drive controller on the two wheel joints.',
    simulationCapabilities: [DRIVE_SIM, ENCODER_SIM, DISTANCE_SIM, cap('navigation', 'Autonomous route planning and maps', 'not-yet-supported', 'There is no mapping or path planning. The robot drives a straight, measured distance.')],
    physicalRequirements: [
      EXPLORER_BUILD,
      cap('deployment-encoders', 'Encoder-based program on hardware', 'not-yet-supported', 'The reference hardware has no encoders; the physical target refuses encoder and odometry calls.'),
    ],
    parts: EXPLORER_PARTS,
    tutorialId: 'tutorial-delivery-robot',
    expectedResult: 'The robot drives about 1.5 m, waits while the path is blocked, and reports the delivery.',
    successCriteria: ['The robot has a working differential drive.', 'The robot has wheel encoders and a distance sensor.', 'The delivery program finished a run.', 'You saw the robot stop near the target distance (manual check).'],
    setup: {
      environmentId: 'arena',
      program: {
        name: 'Delivery Run',
        description: 'Drive 1.5 m measured by the left wheel encoder; wait while the path ahead is blocked.',
        source: [
          '// Delivery run: drive a measured distance, wait while the path is blocked.',
          'const encoder = robotSensors.encoder("left-encoder");',
          'const front = robotSensors.distance("front-distance");',
          'const TARGET = 1.5; // meters to the drop-off point',
          '',
          'await encoder.reset();',
          'let travelled = 0;',
          'for (let i = 0; i < 300 && travelled < TARGET; i++) {',
          '  const ahead = await front.read();',
          '  if (ahead.valid && ahead.distance !== null && ahead.distance < 0.3) {',
          '    robotControl.stop();',
          '    print("Path blocked: waiting");',
          '    await wait(500);',
          '    continue;',
          '  }',
          '  robotControl.drive.set(0.5);',
          '  await wait(100);',
          '  travelled = (await encoder.read()).distance;',
          '}',
          'robotControl.stop();',
          'print("Delivered after", travelled.toFixed(2), "m (encoder estimate)");',
          '',
        ].join('\n'),
      },
    },
    keywords: ['deliver', 'delivery', 'carry', 'transport', 'package', 'parcel', 'bring', 'fetch', 'distance', 'hospital', 'office', 'warehouse', 'cart'],
    environments: ['indoor', 'warehouse'],
  },
  {
    id: 'agriculture-monitoring',
    version: PROJECT_DEFINITION_VERSION,
    name: 'Agriculture Monitoring Robot',
    slug: 'agriculture-monitoring-robot',
    purpose: 'Drive along crop rows and take camera readings.',
    summary: 'A rover with a camera that stops along a row and records how bright and how green the view is. Soil sensors are not available yet.',
    description:
      'Farm robots check crops by driving along rows and taking pictures. This project adds a camera to the Explorer Bot and records brightness and the share of green in each picture. It does not measure soil moisture or recognize plants: those sensors and features do not exist in AutoBotAI yet.',
    realWorldUse: 'Field robots photograph rows of crops to spot dry or unhealthy patches early.',
    howItWorks: [
      'The robot drives a short distance along a row and stops.',
      'The camera takes a picture; the program reads its brightness and mean color.',
      'The program reports the green share of the picture at each stop.',
    ],
    difficulty: 'intermediate',
    category: 'mobile',
    templateId: 'explorer-bot',
    learningObjectives: ['Add a camera to a robot and aim it.', 'Read numbers from a camera image.', 'Collect readings at several stops.', 'Separate what a camera measures from what it cannot tell you.'],
    requiredComponents: [...EXPLORER_COMPONENTS, { componentId: 'sensor-camera', label: 'Camera', count: 1, role: 'Takes pictures of the crops.' }],
    requiredSensors: ['camera'],
    requiredActuators: ['Two DC motors (differential drive)'],
    requiredController: 'Differential-drive controller on the two wheel joints.',
    simulationCapabilities: [
      DRIVE_SIM,
      CAMERA_SIM,
      cap('soil', 'Soil moisture and temperature', 'not-yet-supported', 'There is no soil sensor in the simulation or the parts catalog.'),
      cap('plant-recognition', 'Plant or disease recognition', 'not-yet-supported', 'Cameras do not recognize objects.'),
    ],
    physicalRequirements: [
      EXPLORER_BUILD,
      cap('camera-hw', 'Camera on hardware', 'not-yet-supported', 'Phase 10 hardware has no camera; camera calls are refused on the physical target.'),
    ],
    parts: EXPLORER_PARTS,
    tutorialId: 'tutorial-agriculture-monitoring',
    expectedResult: 'The robot makes three stops and prints brightness and green share for each picture.',
    successCriteria: ['The robot has a working differential drive.', 'The robot has a camera.', 'The monitoring program finished a run.', 'You read the camera numbers in the Program console (manual check).'],
    setup: {
      camera: true,
      environmentId: 'arena',
      program: {
        name: 'Row Monitoring',
        description: 'Three stops along a row; prints camera brightness and green share. No soil sensing or plant recognition.',
        source: [
          '// Row monitoring: stop three times and record camera brightness and green share.',
          '// Keep the 3D view open: the camera renders there. No soil sensor exists yet.',
          'const cameras = await robotCamera.list();',
          'if (cameras.length === 0) {',
          '  print("Add a camera first (Build > Inspector > Sensors > Camera).");',
          '} else {',
          '  const id = cameras[0].id;',
          '  for (let stop = 1; stop <= 3; stop++) {',
          '    await robotControl.drive.forward({ speed: 0.4, durationMs: 1200 });',
          '    try {',
          '      const frame = await robotCamera.capture(id, { format: "none" });',
          '      const { r, g, b } = frame.meanColor;',
          '      const green = g / Math.max(1, r + g + b);',
          '      print("Stop", stop, "brightness", frame.brightness.toFixed(0), "green share", (green * 100).toFixed(0) + " %");',
          '    } catch (error) {',
          '      print("Stop", stop, "no picture:", String(error));',
          '    }',
          '  }',
          '  robotControl.stop();',
          '}',
          '',
        ].join('\n'),
      },
    },
    keywords: ['farm', 'agriculture', 'garden', 'crop', 'crops', 'plant', 'plants', 'soil', 'field', 'monitor', 'monitoring', 'green', 'outdoor', 'water', 'grow'],
    environments: ['outdoor', 'garden'],
  },
  {
    id: 'security-patrol',
    version: PROJECT_DEFINITION_VERSION,
    name: 'Security Patrol Robot',
    slug: 'security-patrol-robot',
    purpose: 'Patrol a route and report when something is close or the view changes.',
    summary: 'Drive a patrol loop, watch the distance sensor, and compare camera brightness between stops to notice changes.',
    description:
      'Patrol robots repeat a route and raise an alert when something unusual happens. This project combines a patrol loop, distance checks and a simple camera comparison. It cannot recognize people or objects: AutoBotAI cameras give numbers about the image, not labels.',
    realWorldUse: 'Security robots patrol warehouses and parking areas at night and alert a guard when they detect a change.',
    howItWorks: [
      'The robot drives the sides of a square again and again.',
      'At each corner it checks the distance sensor for something close.',
      'It takes a camera picture and compares its brightness with the last one to notice a big change.',
    ],
    difficulty: 'advanced',
    category: 'mobile',
    templateId: 'explorer-bot',
    learningObjectives: ['Write nested loops for a repeating route.', 'Combine a distance sensor and a camera.', 'Detect a change by comparing readings over time.', 'Explain the limits of change detection without recognition.'],
    requiredComponents: [...EXPLORER_COMPONENTS, { componentId: 'sensor-camera', label: 'Camera', count: 1, role: 'Looks ahead for changes in the scene.' }],
    requiredSensors: ['distance', 'camera'],
    requiredActuators: ['Two DC motors (differential drive)'],
    requiredController: 'Differential-drive controller on the two wheel joints.',
    simulationCapabilities: [DRIVE_SIM, DISTANCE_SIM, CAMERA_SIM, cap('recognition', 'Person or object recognition', 'not-yet-supported', 'Cameras do not recognize objects; only brightness and color are compared.')],
    physicalRequirements: [
      EXPLORER_BUILD,
      cap('camera-hw', 'Camera on hardware', 'not-yet-supported', 'Phase 10 hardware has no camera; camera calls are refused on the physical target.'),
    ],
    parts: EXPLORER_PARTS,
    tutorialId: 'tutorial-security-patrol',
    expectedResult: 'The robot drives two patrol laps, reports close objects and big brightness changes.',
    successCriteria: ['The robot has a working differential drive.', 'The robot has a distance sensor and a camera.', 'The patrol program finished a run in the Physics engine.', 'You saw at least one report in the Program console (manual check).'],
    setup: {
      camera: true,
      environmentId: 'arena',
      program: {
        name: 'Patrol Loop',
        description: 'Two laps of a square; reports close objects and big camera brightness changes. No recognition.',
        source: [
          '// Patrol: two laps of a square. Report close objects and big changes in the view.',
          '// Use Simulate (Physics engine) for the distance sensor and keep the 3D view open for the camera.',
          'const front = robotSensors.distance("front-distance");',
          'const cameras = await robotCamera.list();',
          'let lastBrightness = null;',
          '',
          'for (let lap = 1; lap <= 2; lap++) {',
          '  for (let side = 1; side <= 4; side++) {',
          '    await robotControl.drive.forward({ speed: 0.5, durationMs: 1200 });',
          '    await robotControl.turn.left({ rate: 0.5, durationMs: 900 });',
          '    const ahead = await front.read();',
          '    if (ahead.valid && ahead.distance !== null && ahead.distance < 0.5) {',
          '      print("Lap", lap, "corner", side, ": something is", ahead.distance.toFixed(2), "m ahead");',
          '    }',
          '    if (cameras.length > 0) {',
          '      try {',
          '        const frame = await robotCamera.capture(cameras[0].id, { format: "none" });',
          '        if (lastBrightness !== null && Math.abs(frame.brightness - lastBrightness) > 15) {',
          '          print("Lap", lap, "corner", side, ": the view changed (brightness", lastBrightness.toFixed(0), "to", frame.brightness.toFixed(0) + ")");',
          '        }',
          '        lastBrightness = frame.brightness;',
          '      } catch (error) {',
          '        print("No picture:", String(error));',
          '      }',
          '    }',
          '  }',
          '}',
          'robotControl.stop();',
          'print("Patrol finished");',
          '',
        ].join('\n'),
      },
    },
    keywords: ['security', 'patrol', 'guard', 'watch', 'surveillance', 'intruder', 'alarm', 'camera', 'monitor', 'night', 'parking', 'warehouse', 'detect', 'change'],
    environments: ['indoor', 'warehouse', 'outdoor'],
  },
];

export function findProjectDefinition(idOrSlug: string): ProjectDefinition | undefined {
  return PROJECT_DEFINITIONS.find((p) => p.id === idOrSlug || p.slug === idOrSlug);
}

export const DIFFICULTY_LABEL: Record<ProjectDefinition['difficulty'], string> = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' };

/** Overall simulation status: the weakest required capability decides. */
export function simulationSummary(def: ProjectDefinition): { label: string; tone: 'ok' | 'warn' | 'err' } {
  const statuses = def.simulationCapabilities.map((c) => c.status);
  if (statuses.every((s) => s === 'supported' || s === 'simulation-only')) return { label: 'Simulation supported', tone: 'ok' };
  if (statuses.includes('not-yet-supported')) return { label: 'Partly simulated', tone: 'warn' };
  return { label: 'Simulation needs setup', tone: 'warn' };
}

/** Overall physical status, never stronger than what is verified. */
export function physicalSummary(def: ProjectDefinition): { label: string; tone: 'ok' | 'warn' | 'err' | 'neutral' } {
  const statuses = def.physicalRequirements.map((c) => c.status);
  if (statuses.includes('hardware-deployment')) return { label: 'Hardware deployment (Explorer Bot reference, not physically tested)', tone: 'warn' };
  if (statuses.includes('build-guide')) return { label: 'Build guide only', tone: 'neutral' };
  return { label: 'No physical build yet', tone: 'err' };
}
