/**
 * Tutorials are built from ONE reusable nine-stage journey and the project definition.
 * Steps are conditional: a camera step appears only for projects that need a camera, the
 * physical build step only when a verified physical path exists, and so on.
 */
import { STAGE_LABEL, TUTORIAL_VERSION, type CheckSpec, type ProjectDefinition, type TutorialDefinition, type TutorialStep } from '../model/types';
import { PROJECT_DEFINITIONS, findProjectDefinition } from './projects';

/** Per-project choices the generic journey needs. */
interface TutorialConfig {
  /** Component the learner selects in the Objects list (real selection check). */
  keyComponent: { componentId: string; label: string };
  /** API names the learner's program must use. */
  programUses: string[];
  /** The run must happen in the Physics engine (distance sensing). */
  physicsRun: boolean;
  /** Environment to test in, with a minimum object count, or null. */
  environment: { id: string; minObjects: number; label: string } | null;
}

const CONFIG: Record<string, TutorialConfig> = {
  'obstacle-avoidance': {
    keyComponent: { componentId: 'sensor-distance', label: 'Distance Sensor' },
    programUses: ['robotSensors.distance', 'robotControl.'],
    physicsRun: true,
    environment: { id: 'obstacles', minObjects: 3, label: 'Obstacle Course' },
  },
  'line-following': {
    keyComponent: { componentId: 'wheel-standard', label: 'a drive wheel' },
    programUses: ['robotControl.drive', 'robotControl.turn'],
    physicsRun: false,
    environment: null,
  },
  'pick-and-place-arm': {
    keyComponent: { componentId: 'other-gripper', label: 'Gripper' },
    programUses: ['robotControl.joint'],
    physicsRun: false,
    environment: null,
  },
  'delivery-robot': {
    keyComponent: { componentId: 'motor-dc', label: 'a DC motor' },
    programUses: ['robotSensors.encoder', 'robotSensors.distance'],
    physicsRun: true,
    environment: { id: 'arena', minObjects: 3, label: 'Basic Test Arena' },
  },
  'agriculture-monitoring': {
    keyComponent: { componentId: 'chassis-rect', label: 'Chassis' },
    programUses: ['robotCamera.capture'],
    physicsRun: false,
    environment: null,
  },
  'security-patrol': {
    keyComponent: { componentId: 'sensor-distance', label: 'Distance Sensor' },
    programUses: ['robotSensors.distance', 'robotCamera.capture'],
    physicsRun: true,
    environment: { id: 'arena', minObjects: 3, label: 'Basic Test Arena' },
  },
};

const mobile = (def: ProjectDefinition) => def.category === 'mobile';

export function buildTutorial(def: ProjectDefinition): TutorialDefinition {
  const cfg = CONFIG[def.id];
  if (!cfg) throw new Error(`No tutorial configuration for ${def.id}`);
  const needsCamera = def.requiredSensors.includes('camera');
  const hasParts = def.parts.length > 0;
  const physical = def.physicalRequirements.some((c) => c.status === 'build-guide' || c.status === 'hardware-deployment');
  const steps: TutorialStep[] = [];
  const add = (step: Omit<TutorialStep, 'title'> & { title?: string }) => steps.push({ title: STAGE_LABEL[step.stage], ...step });

  add({
    id: 'purpose',
    stage: 'purpose',
    learn: [def.description, `Real-world use: ${def.realWorldUse}`, ...def.howItWorks],
    doText: ['Read how the robot works. Then say in your own words what it is for.'],
    actions: [],
    verify: { checks: [], manualPrompt: `I can explain what the ${def.name} is for: ${def.purpose}` },
    optional: false,
  });

  add({
    id: 'components',
    stage: 'components',
    learn: def.requiredComponents.map((c) => `${c.label} (${c.count}): ${c.role}`),
    doText: ['Open Build and the Objects list on the left.', `Click ${cfg.keyComponent.label} in the Objects list or in the 3D view to select it.`],
    actions: [{ label: 'Open Build', mode: 'build' }],
    verify: {
      checks: [
        ...def.requiredComponents.map((c): CheckSpec => ({ kind: 'component', componentId: c.componentId, min: c.count, label: `${c.count} × ${c.label}` })),
        { kind: 'selected', componentId: cfg.keyComponent.componentId, label: `${cfg.keyComponent.label} is selected` },
      ],
      manualPrompt: null,
    },
    optional: false,
  });

  if (needsCamera) {
    add({
      id: 'design-camera',
      stage: 'design',
      title: 'Design Robot in 3D: add a camera',
      learn: ['A camera turns what the robot sees into numbers: an image, its brightness and its mean color.', 'AutoBotAI cameras do not recognize objects. Your program decides what the numbers mean.'],
      doText: ['Click "Add a camera" (or Build → Inspector → Sensors → Camera). A camera part appears at the front of the robot, looking forward.', 'You can undo it with Ctrl+Z.'],
      actions: [{ label: 'Open Build', mode: 'build' }, { label: 'Add a camera', addCamera: true }],
      verify: { checks: [{ kind: 'sensor', sensorType: 'camera', label: 'The robot has a camera' }], manualPrompt: null },
      optional: false,
    });
  } else {
    add({
      id: 'design',
      stage: 'design',
      learn: mobile(def)
        ? ['Look at the robot from the side and from the top. The wheels sit on the sides, the caster at the back and the sensor at the front.', 'Where a part sits matters: a distance sensor only sees what is in front of it.']
        : ['Look at the arm from the front. The purple spheres mark where the shoulder, elbow and wrist rotate.', 'Each link is attached to the one before it, so moving the shoulder moves everything above it.'],
      doText: ['Use the view buttons (Front, Top, Perspective) in the 3D view to look at the robot from several sides.'],
      actions: [{ label: 'Open Build', mode: 'build' }],
      verify: {
        checks: mobile(def)
          ? [{ kind: 'component', componentId: 'wheel-standard', min: 2, label: 'Two drive wheels are in the design' }]
          : [{ kind: 'component', componentId: 'joint-revolute', min: 3, label: 'Three joint markers are in the design' }],
        manualPrompt: null,
      },
      optional: false,
    });
  }

  add({
    id: 'assemble',
    stage: 'assemble',
    learn: mobile(def)
      ? ['A differential drive needs two drive wheels on the same part, each on a revolute joint, plus two motors.', 'The differential-drive controller turns "forward" and "turn" into a speed for each wheel.']
      : ['A joint only moves when something drives it. A position actuator moves a revolute joint to an exact angle within its limits.', 'The Robotic Arm template has joints but no actuators yet.'],
    doText: mobile(def)
      ? ['Check the drive setup. If something is missing, open Build → Inspector and use "Set up differential drive".']
      : ['Open Build, click a joint marker (Shoulder, Elbow, Wrist) and add a "Generic Joint Actuator" in the inspector. Repeat for every joint.'],
    actions: [{ label: 'Open Build', mode: 'build' }],
    verify: { checks: mobile(def) ? [{ kind: 'drive' }] : [{ kind: 'jointActuators' }], manualPrompt: null },
    optional: false,
  });

  add({
    id: 'electronics',
    stage: 'electronics',
    learn: hasParts
      ? ['The 3D parts are placeholders. In the Robot Blueprint you map each one to a real, verified part and see how they are wired.', 'A motor driver sits between the controller and the motors, because a controller pin cannot power a motor directly.']
      : ['Motors are never powered from a controller pin directly: a driver or servo controller supplies the current.', 'AutoBotAI has no verified parts for this robot yet, so there is no wiring plan to follow.'],
    doText: hasParts ? ['Open the Blueprint, go to Real Parts and map at least two parts (for example the motors and the controller board).'] : ['Read the notes above. There is nothing to wire for this project in AutoBotAI yet.'],
    actions: hasParts ? [{ label: 'Open Blueprint', mode: 'blueprint' }] : [],
    verify: hasParts ? { checks: [{ kind: 'blueprintMapped', min: 2 }], manualPrompt: null } : { checks: [], manualPrompt: 'I understand why motors need a driver and that this project has no verified wiring plan yet.' },
    optional: true,
  });

  add({
    id: 'programming',
    stage: 'programming',
    learn: [
      'A robot program repeats a loop: read the sensors, decide, act.',
      `This project's program uses ${cfg.programUses.map((u) => u.replace(/\.$/, '')).join(' and ')}.`,
      'You can type your own program or insert the starter program and read it line by line.',
    ],
    doText: ['Open Code. Click "Insert starter program" to add it as a new program, or write your own in JavaScript or Blocks.', 'Save the program.'],
    actions: [{ label: 'Open Code', mode: 'code' }, { label: 'Insert starter program', insertProgram: true }],
    verify: { checks: [{ kind: 'program', mustUse: cfg.programUses, label: `A saved program uses ${cfg.programUses.map((u) => u.replace(/\.$/, '')).join(' and ')}` }], manualPrompt: null },
    optional: false,
  });

  const simChecks: CheckSpec[] = [];
  if (cfg.environment) simChecks.push({ kind: 'environment', minObjects: cfg.environment.minObjects });
  simChecks.push({ kind: 'programRun', physics: cfg.physicsRun });
  add({
    id: 'simulation',
    stage: 'simulation',
    learn: [
      cfg.physicsRun ? 'The distance sensor only works in the Physics engine, so start the simulation with Simulate before you run the program.' : 'Run the program and watch the robot in the 3D view.',
      ...(cfg.environment ? [`Test in the ${cfg.environment.label}: real walls and boxes give the sensors something to see.`] : []),
    ],
    doText: [
      ...(cfg.environment ? [`Select the ${cfg.environment.label} (button below).`] : []),
      cfg.physicsRun ? 'Click Simulate (Physics), then Run in Code Studio and let the program finish.' : 'Click Run in Code Studio and let the program finish.',
    ],
    actions: [
      ...(cfg.environment ? [{ label: `Use the ${cfg.environment.label}`, environmentId: cfg.environment.id }] : []),
      { label: 'Open Code', mode: 'code' as const },
      ...(cfg.physicsRun ? [{ label: 'Simulate (Physics)', physics: true }] : []),
    ],
    verify: { checks: simChecks, manualPrompt: null },
    optional: false,
  });

  if (physical) {
    add({
      id: 'physical',
      stage: 'physical',
      learn: [
        'The Robot Blueprint has a Build Guide with the parts, wiring and assembly order for the verified parts.',
        ...def.physicalRequirements.map((c) => `${c.label}: ${c.note}`),
        'AutoBotAI has not tested any physical robot. Follow the safety guide before you power motors.',
      ],
      doText: ['Open the Blueprint and read the Build Guide. You do not have to build the robot to finish this tutorial.'],
      actions: [{ label: 'Open Blueprint', mode: 'blueprint' }],
      verify: { checks: [], manualPrompt: 'I read the Build Guide and the safety notes. (This does not mean the robot was built or tested.)' },
      optional: true,
    });
  }

  add({
    id: 'complete',
    stage: 'complete',
    learn: [`Expected result: ${def.expectedResult}`, ...def.successCriteria.map((c) => `Success: ${c}`)],
    doText: ['Save the project, then confirm what you saw.'],
    actions: [],
    verify: { checks: [{ kind: 'saved' }], manualPrompt: `I saw the expected result: ${def.expectedResult}` },
    optional: false,
  });

  return { id: def.tutorialId, version: TUTORIAL_VERSION, projectId: def.id, title: `${def.name} tutorial`, steps };
}

export const TUTORIALS: readonly TutorialDefinition[] = PROJECT_DEFINITIONS.map(buildTutorial);

export function findTutorial(id: string): TutorialDefinition | undefined {
  return TUTORIALS.find((t) => t.id === id);
}

export function definitionForTutorial(tutorial: TutorialDefinition): ProjectDefinition | undefined {
  return findProjectDefinition(tutorial.projectId);
}
