import type { BlueprintData, StepState } from '../model/types';
import type { CompatCheck } from './compatibility';
import { virtualComponents, differences, type ModelView } from './virtualComponents';
import type { WiringReport } from './wiring';

/**
 * Build Guide. The structure is generated from the blueprint with stable step
 * ids, so a step keeps its status and note when the guide is regenerated.
 * Status is only ever changed by the user: nothing is completed automatically.
 */

export const GUIDE_SECTIONS = [
  { id: 'overview', title: '1. Project overview' },
  { id: 'design', title: '2. 3D design' },
  { id: 'components', title: '3. Component list' },
  { id: 'mechanical', title: '4. Mechanical assembly sequence' },
  { id: 'mounting', title: '5. Mounting instructions' },
  { id: 'wiring', title: '6. Wiring instructions' },
  { id: 'power', title: '7. Power system setup' },
  { id: 'controller', title: '8. Controller setup' },
  { id: 'motors', title: '9. Motor setup' },
  { id: 'sensors', title: '10. Sensor setup' },
  { id: 'software', title: '11. Software setup' },
  { id: 'safety', title: '12. Safety checklist before powering on' },
  { id: 'testing', title: '13. Initial testing' },
  { id: 'troubleshooting', title: '14. Troubleshooting' },
] as const;

export type GuideSectionId = (typeof GUIDE_SECTIONS)[number]['id'];

export interface GuideStep {
  id: string;
  section: GuideSectionId;
  title: string;
  detail: string;
  /** Unresolved problem that should be fixed first (shown as advice; the status is not changed). */
  attention: string | null;
}

export interface GuideInput {
  model: ModelView;
  data: BlueprintData;
  checks: readonly CompatCheck[];
  wiring: WiringReport;
  programNames: readonly string[];
}

export function generateGuide({ model, data, checks, wiring, programNames }: GuideInput): GuideStep[] {
  const steps: GuideStep[] = [];
  const add = (section: GuideSectionId, id: string, title: string, detail: string, attention: string | null = null) => steps.push({ id: `${section}:${id}`, section, title, detail, attention });
  const vcs = virtualComponents(model, data);
  const mapped = vcs.filter((v) => v.mapping);
  const problemFor = (mappingId: string) => {
    const c = checks.find((x) => x.mappingIds.includes(mappingId) && x.status === 'incompatible');
    return c ? `Resolve first: ${c.title}. ${c.reason}` : null;
  };
  const incompatible = checks.filter((c) => c.status === 'incompatible');

  add('overview', 'review', 'Review the blueprint', `${mapped.length} of ${vcs.length} components are mapped to real parts. Read the Compatibility tab before buying parts.`, incompatible.length ? `${incompatible.length} incompatibility(ies) are open.` : null);
  const unmapped = vcs.filter((v) => !v.mapping);
  if (unmapped.length) add('overview', 'unmapped', 'Decide on unmapped components', `Not mapped yet: ${unmapped.map((v) => v.name).join(', ')}. Map them or note how you will make them (for example a cut plate for the chassis).`);

  add('design', 'compare', 'Compare the 3D model with the real parts', 'The 3D model is a simulation model. Compare its dimensions with the real parts before cutting or drilling anything.');
  for (const v of mapped) {
    const diffs = differences(v, v.mapping!.snapshot);
    if (diffs.length) add('design', `diff:${v.id}`, `Check ${v.name} dimensions`, diffs.map((d) => `${d.label}: 3D ${d.virtual}, real ${d.physical}.`).join(' '));
  }

  add('components', 'gather', 'Gather every required part in the BOM', 'Use the BOM tab. Check prices and availability with the seller; stored prices are not live.');
  for (const v of mapped) {
    const p = v.mapping!.snapshot;
    add('components', `check:${v.mapping!.id}`, `Check ${p.name} against its documentation`, `For ${v.name}. Source: ${p.source.url} (checked ${p.source.verifiedAt}).`, p.verification === 'unverified' ? 'Generic part: confirm the specs of the exact module you received.' : null);
  }

  const order = ['chassis', 'body', 'motor', 'wheel', 'other', 'sensor', 'joint'];
  const mech = mapped.filter((v) => v.kind === 'component').sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category));
  add('mechanical', 'frame', 'Prepare the chassis', 'Mark and drill the mounting holes using the parts’ dimension drawings.');
  for (const v of mech) add('mechanical', `install:${v.mapping!.id}`, `Install ${v.mapping!.snapshot.name} as ${v.name}`, v.mapping!.snapshot.mounting ?? 'Mounting method is not stated in the source; check the part drawing.', problemFor(v.mapping!.id));

  for (const v of mapped.filter((x) => ['controller', 'driver', 'power', 'sensor', 'camera'].includes(x.mapping!.snapshot.category))) {
    add('mounting', `mount:${v.mapping!.id}`, `Mount ${v.mapping!.snapshot.name}`, `${v.name}. ${v.mapping!.snapshot.mounting ?? 'Mounting holes and method are not stated in the source; use standoffs or a holder that fits the board.'} Keep it clear of moving parts.`);
  }

  add('wiring', 'plan', 'Check the wiring plan', 'The wiring list is a planning aid, not a verified schematic. Fix every flagged problem before connecting anything.', wiring.issues.some((i) => i.severity === 'error') ? `${wiring.issues.filter((i) => i.severity === 'error').length} wiring error(s) are open.` : null);
  for (const w of data.wiring) {
    const target = vcs.find((v) => v.ref === w.componentRef);
    const issue = wiring.issues.find((i) => i.recordId === w.id);
    add('wiring', `wire:${w.id}`, `Connect ${w.controllerPin || '(pin not set)'} → ${target?.name ?? w.componentRef} ${w.componentPin || '(pin not set)'}`, `${w.interface}${w.voltage !== null ? `, ${w.voltage} V` : ', voltage unknown'}. ${w.notes}`.trim(), issue ? issue.message : null);
  }

  add('power', 'polarity', 'Check battery polarity and voltage', 'Measure the pack voltage with a multimeter before connecting it.');
  for (const v of mapped.filter((x) => x.mapping!.snapshot.category === 'power')) add('power', `part:${v.mapping!.id}`, `Set up ${v.mapping!.snapshot.name}`, `${v.name}.`, problemFor(v.mapping!.id));

  const ctrl = mapped.find((v) => ['microcontroller-board', 'single-board-computer'].includes(v.mapping!.snapshot.role));
  if (ctrl) add('controller', 'setup', `Set up ${ctrl.mapping!.snapshot.name}`, 'Power it from USB only first and upload a blink test program.');
  else add('controller', 'choose', 'Choose and map a controller', 'No controller is mapped yet.');

  for (const v of mapped.filter((x) => x.mapping!.snapshot.category === 'motor')) add('motors', `motor:${v.mapping!.id}`, `Test ${v.name} direction`, 'Lift the wheels off the ground. Run the motor slowly in both directions and note which way it turns.', problemFor(v.mapping!.id));
  for (const v of mapped.filter((x) => x.mapping!.snapshot.category === 'sensor' || x.mapping!.snapshot.category === 'camera')) add('sensors', `sensor:${v.mapping!.id}`, `Test ${v.name}`, 'Read the sensor alone with a simple test program and compare the values with a ruler.', problemFor(v.mapping!.id));

  add('software', 'port', 'Port the robot program', programNames.length ? `Code Studio programs in this project: ${programNames.join(', ')}. They run in the simulator; real hardware needs firmware written for the controller.` : 'No Code Studio program is saved for this project yet.');

  add('safety', 'no-shorts', 'No loose wires or exposed conductors', 'Check every connection for shorts before power-on.');
  add('safety', 'polarity', 'Polarity checked on every power wire', 'Red to +, black to −, on the battery, driver and regulator.');
  add('safety', 'voltages', 'Voltages measured at every power pin', 'Compare with the accepted ranges in the Wiring tab.');
  add('safety', 'ground', 'Common ground connected', 'Battery negative, driver GND and controller GND are connected.');
  add('safety', 'fuse', 'Fuse or power switch in place', 'You can cut power quickly.');
  add('safety', 'wheels', 'Wheels off the ground for the first test', 'The robot cannot drive away.');

  add('testing', 'power-only', 'Power on without motors connected', 'Check that the controller starts and nothing gets hot.');
  add('testing', 'sensors', 'Check sensor readings', 'Compare with the simulator readings in the Sensor Monitor.');
  add('testing', 'motors-lifted', 'Run the motors with the wheels lifted', 'Low speed first.');
  add('testing', 'floor', 'First drive on the floor', 'Short, slow moves in an open area.');

  add('troubleshooting', 'no-power', 'Nothing powers on', 'Check the battery voltage, the switch or fuse, and the regulator input range.');
  add('troubleshooting', 'motor-wrong-way', 'A motor turns the wrong way', 'Swap that motor’s two wires or invert it in software.');
  add('troubleshooting', 'resets', 'The controller resets when motors start', 'The supply voltage drops: check the battery, wiring thickness and the stall current warnings.');
  add('troubleshooting', 'sensor-zero', 'A sensor reads zero or nothing', 'Check its supply, ground, I²C address or trigger/echo pins.');
  return steps;
}

export function stepState(states: Record<string, StepState>, id: string): StepState {
  return states[id] ?? { status: 'not-started', note: '', updatedAt: '' };
}

export function guideProgress(steps: readonly GuideStep[], states: Record<string, StepState>): Record<StepState['status'], number> {
  const out = { 'not-started': 0, 'in-progress': 0, completed: 0, blocked: 0 };
  for (const s of steps) out[stepState(states, s.id).status] += 1;
  return out;
}

