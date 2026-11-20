/**
 * Guided Robot Purpose Builder — deterministic, rule-based matching against the six
 * project definitions. No external AI. Every reason shown comes from a rule below.
 */
import { PROJECT_DEFINITIONS } from '../catalog/projects';
import type { Difficulty, ProjectDefinition } from '../model/types';

export type DetectChoice = 'obstacles' | 'line' | 'objects-to-move' | 'images' | 'distance-travelled' | 'soil' | 'people';
export type WhereChoice = 'indoor' | 'outdoor' | 'warehouse' | 'garden' | 'table';

export interface PurposeAnswers {
  text: string;
  where?: WhereChoice | null;
  detect?: DetectChoice[];
  experience?: Difficulty | null;
  budget?: 'lowest' | 'any' | null;
}

export interface UnsupportedNote {
  id: string;
  what: string;
  missing: string;
  closestId: string;
}

export interface Match {
  def: ProjectDefinition;
  score: number;
  reasons: string[];
}

export interface PurposeResult {
  best: Match | null;
  alternatives: Match[];
  unsupported: UnsupportedNote[];
  /** True when the goal needs something AutoBotAI cannot do yet. */
  goalUnsupported: boolean;
}

/** Things people ask for that AutoBotAI cannot do yet, with the closest supported project. */
const UNSUPPORTED: readonly { id: string; words: string[]; what: string; missing: string; closestId: string }[] = [
  { id: 'soil', words: ['soil', 'moisture', 'humidity', 'temperature', 'ph', 'water level'], what: 'Measuring soil, moisture or temperature', missing: 'There is no soil, moisture or temperature sensor in the simulation or the parts catalog.', closestId: 'agriculture-monitoring' },
  { id: 'recognition', words: ['recognize', 'recognise', 'recognition', 'identify', 'face', 'faces', 'person', 'people', 'human', 'humans', 'intruder', 'object detection', 'classify'], what: 'Recognizing people or objects', missing: 'Cameras give an image, brightness and mean color. There is no object or face recognition.', closestId: 'security-patrol' },
  { id: 'flight', words: ['fly', 'flying', 'drone', 'aerial', 'air', 'quadcopter'], what: 'Flying', missing: 'Drone flight is not simulated (the quadcopter template has no thrust or flight dynamics).', closestId: 'obstacle-avoidance' },
  { id: 'walking', words: ['walk', 'walking', 'legs', 'legged', 'humanoid', 'biped', 'quadruped', 'dog'], what: 'Walking on legs', missing: 'Walking robots are not simulated; the humanoid template has no balance or gait control.', closestId: 'obstacle-avoidance' },
  { id: 'water', words: ['swim', 'underwater', 'boat', 'pool', 'water surface'], what: 'Working in or on water', missing: 'Water is not simulated.', closestId: 'obstacle-avoidance' },
  { id: 'voice', words: ['talk', 'voice', 'speech', 'speak', 'chat', 'listen', 'conversation'], what: 'Talking or listening', missing: 'There is no microphone, speaker or speech feature.', closestId: 'security-patrol' },
  { id: 'mapping', words: ['map', 'mapping', 'slam', 'gps', 'autonomous navigation', 'path planning', 'find its way'], what: 'Mapping or autonomous route planning', missing: 'There is no mapping, GPS or path planning. Robots follow the moves and sensor rules in their program.', closestId: 'delivery-robot' },
  { id: 'line-sensor', words: ['line', 'lines', 'tape'], what: 'Sensing a line on the floor', missing: 'There is no line (reflectance) sensor; the Line Following project practices the route with timed moves.', closestId: 'line-following' },
  { id: 'grasp', words: ['grab', 'grasp', 'hold', 'pick up', 'pick'], what: 'Holding objects in a gripper', missing: 'Grasping is not simulated: the arm moves through the poses, but the gripper does not hold objects.', closestId: 'pick-and-place-arm' },
  { id: 'cutting', words: ['mow', 'mower', 'lawn', 'cut', 'cutting', 'weed', 'spray', 'harvest'], what: 'Cutting, spraying or harvesting', missing: 'There are no cutting, spraying or harvesting tools.', closestId: 'agriculture-monitoring' },
  { id: 'cleaning', words: ['vacuum', 'clean', 'cleaning', 'sweep', 'mop'], what: 'Cleaning the floor', missing: 'There is no vacuum or brush; the Obstacle Avoidance project covers the driving part.', closestId: 'obstacle-avoidance' },
];

const DETECT_RULES: Record<DetectChoice, { ids: string[]; points: number; reason: string }> = {
  obstacles: { ids: ['obstacle-avoidance', 'delivery-robot', 'security-patrol'], points: 4, reason: 'uses a distance sensor to detect obstacles' },
  line: { ids: ['line-following'], points: 6, reason: 'is about following a line (line sensing itself is not supported yet)' },
  'objects-to-move': { ids: ['pick-and-place-arm'], points: 6, reason: 'moves an arm to pick and place positions' },
  images: { ids: ['agriculture-monitoring', 'security-patrol'], points: 4, reason: 'uses a camera' },
  'distance-travelled': { ids: ['delivery-robot'], points: 4, reason: 'measures distance traveled with wheel encoders' },
  soil: { ids: ['agriculture-monitoring'], points: 2, reason: 'monitors crops with a camera (soil sensing is not supported)' },
  people: { ids: ['security-patrol'], points: 2, reason: 'notices changes with a camera (it cannot recognize people)' },
};

const LEVEL: Record<Difficulty, number> = { beginner: 0, intermediate: 1, advanced: 2 };

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/** Whole-word (or whole-phrase) match. */
function contains(tokens: readonly string[], word: string): boolean {
  return word.includes(' ') ? ` ${tokens.join(' ')} `.includes(` ${word} `) : tokens.includes(word) || tokens.includes(`${word}s`) || (word.endsWith('s') && tokens.includes(word.slice(0, -1)));
}

export function matchPurpose(answers: PurposeAnswers, defs: readonly ProjectDefinition[] = PROJECT_DEFINITIONS): PurposeResult {
  const tokens = tokenize(answers.text);
  const unsupported: UnsupportedNote[] = UNSUPPORTED.filter((u) => u.words.some((w) => contains(tokens, w))).map(({ id, what, missing, closestId }) => ({ id, what, missing, closestId }));
  for (const d of answers.detect ?? []) {
    if (d === 'soil' && !unsupported.some((u) => u.id === 'soil')) unsupported.push({ id: 'soil', what: 'Measuring soil conditions', missing: UNSUPPORTED.find((u) => u.id === 'soil')!.missing, closestId: 'agriculture-monitoring' });
    if (d === 'people' && !unsupported.some((u) => u.id === 'recognition')) unsupported.push({ id: 'recognition', what: 'Recognizing people', missing: UNSUPPORTED.find((u) => u.id === 'recognition')!.missing, closestId: 'security-patrol' });
  }

  const matches: Match[] = defs.map((def) => {
    let score = 0;
    const reasons: string[] = [];
    const hits = def.keywords.filter((k) => contains(tokens, k));
    if (hits.length) {
      score += hits.length * 3;
      reasons.push(`Your description mentions ${hits.slice(0, 4).map((h) => `"${h}"`).join(', ')}.`);
    }
    for (const d of answers.detect ?? []) {
      const rule = DETECT_RULES[d];
      if (rule.ids.includes(def.id)) {
        score += rule.points;
        reasons.push(`It ${rule.reason}.`);
      }
    }
    if (answers.where && def.environments.includes(answers.where)) {
      score += 2;
      reasons.push(`It is meant for ${answers.where} use.`);
    }
    // Unsupported concepts point to their closest supported project.
    for (const u of unsupported) {
      if (u.closestId === def.id) {
        score += 2;
        reasons.push(`It is the closest supported project for "${u.what.toLowerCase()}".`);
      }
    }
    if (score > 0 && answers.experience) {
      const gap = LEVEL[def.difficulty] - LEVEL[answers.experience];
      if (gap === 0) {
        score += 2;
        reasons.push(`It matches your level (${answers.experience}).`);
      } else if (gap > 0) {
        score -= 2 * gap;
        reasons.push(`It is harder than your level (${def.difficulty}).`);
      }
    }
    if (score > 0 && answers.budget === 'lowest' && def.parts.length === 0) reasons.push('It needs no hardware: you can do it fully in simulation.');
    return { def, score, reasons };
  });

  const ranked = matches.filter((m) => m.score > 0).sort((a, b) => b.score - a.score || defs.indexOf(a.def) - defs.indexOf(b.def));
  const best = ranked[0] ?? null;
  // The goal is unsupported when a core concept is missing AND no supported keyword matched it directly.
  const coreUnsupported = unsupported.filter((u) => !['line-sensor', 'grasp', 'cleaning'].includes(u.id));
  const goalUnsupported = coreUnsupported.length > 0;
  return { best, alternatives: ranked.slice(1, 3), unsupported, goalUnsupported };
}
