/**
 * Starter content for new programs. The JavaScript starter follows the
 * Phase 4 brief, adapted to the sandbox API (every robotControl call returns a
 * Promise; timed moves resolve when the move has finished).
 */

export const STARTER_JAVASCRIPT = `// AutoBotAI Robot Program

async function main() {
  console.log("Robot program started");

  await robotControl.drive.forward({
    speed: 0.5,
    durationMs: 2000
  });

  await robotControl.turn.left({
    rate: 0.5,
    durationMs: 1000
  });

  await robotControl.stop();

  console.log("Robot program completed");
}

main();
`;

export const JAVASCRIPT_TEMPLATES: readonly { id: string; name: string; description: string; source: string }[] = [
  { id: 'starter', name: 'Drive and turn', description: 'Forward for 2 s, turn left for 1 s, stop.', source: STARTER_JAVASCRIPT },
  {
    id: 'square',
    name: 'Drive a square',
    description: 'Four sides with a loop.',
    source: `// Drive a square
for (let side = 1; side <= 4; side++) {
  console.log("Side " + side);
  await robotControl.drive.forward({ speed: 0.6, durationMs: 1500 });
  await robotControl.turn.left({ rate: 0.5, durationMs: 1570 });
}
await robotControl.stop();
`,
  },
  {
    id: 'arc',
    name: 'Drive an arc',
    description: 'Drive and turn at the same time, then stop.',
    source: `// Drive and turn together for an arc
await robotControl.drive.set(0.6);
await robotControl.turn.set(0.4);
await wait(3000);
await robotControl.stop();
`,
  },
  {
    id: 'joints',
    name: 'List joints',
    description: 'Print the movable joints of the robot and their limits.',
    source: `// Print every movable joint
const joints = await robot.joints();
for (const joint of joints) {
  console.log(joint.name + " (" + joint.type + "): " + joint.lower + " … " + joint.upper + (joint.hasActuator ? " · motor" : ""));
}
`,
  },
];

/**
 * The Blockly starter: When program starts → move forward → turn left → stop robot.
 * Stored in Blockly's JSON serialization format.
 */
export function starterBlocklyWorkspace(): string {
  const num = (value: number) => ({ shadow: { type: 'math_number', fields: { NUM: value } } });
  return JSON.stringify({
    blocks: {
      languageVersion: 0,
      blocks: [
        {
          type: 'robot_start',
          x: 40,
          y: 40,
          next: {
            block: {
              type: 'robot_move_forward',
              inputs: { SPEED: num(0.5), DURATION: num(2000) },
              next: {
                block: {
                  type: 'robot_turn_left',
                  inputs: { RATE: num(0.5), DURATION: num(1000) },
                  next: { block: { type: 'robot_stop' } },
                },
              },
            },
          },
        },
      ],
    },
  });
}
