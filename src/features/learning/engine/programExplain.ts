/**
 * Explains a REAL program line by line. API calls are explained from the same API
 * reference that drives Code Studio's help, so explanations never describe a function
 * that does not exist. Lines with nothing to explain get no explanation.
 */
import { API_REFERENCE } from '../../code-studio/api/apiReference';

export interface ExplainedLine {
  number: number;
  code: string;
  explanation: string | null;
  kind: 'comment' | 'api' | 'control' | 'variable' | 'other' | 'blank';
}

// Longest names first, so "robotControl.drive.forward" wins over "robotControl.drive".
const API_BY_LENGTH = [...API_REFERENCE].sort((a, b) => b.name.length - a.name.length);

/** Calls written with a variable, e.g. `sensor.read()` after `const sensor = robotSensors.distance(...)`. */
const METHOD_HINTS: Record<string, string> = {
  '.read(': 'Reads the latest value from the sensor this variable holds.',
  '.reset(': 'Sets the sensor back to zero.',
  '.setTarget(': 'Moves the joint to this target with its position actuator and waits until it arrives.',
};

function explainControl(line: string): string | null {
  const t = line.trim();
  if (/^for\s*\(/.test(t)) return 'A loop: the lines inside the braces repeat while the condition in the brackets is true.';
  if (/^while\s*\(/.test(t)) return 'A loop that repeats as long as its condition is true.';
  if (/^if\s*\(/.test(t)) return 'A decision: the lines below run only when the condition is true.';
  if (/^}\s*else if\s*\(/.test(t) || /^else if\s*\(/.test(t)) return 'Another condition, checked when the one before was false.';
  if (/^}\s*else\b/.test(t) || /^else\b/.test(t)) return 'Otherwise: these lines run when the condition above was false.';
  if (/^(async\s+)?function\s/.test(t)) return 'Defines a reusable block of steps (a function) that later lines can call.';
  if (/^break\b/.test(t)) return 'Leaves the loop.';
  if (/^continue\b/.test(t)) return 'Skips to the next round of the loop.';
  if (/^try\b/.test(t)) return 'Try these lines; if one fails, the catch block below handles the error instead of stopping the program.';
  if (/^}\s*catch\b/.test(t)) return 'Runs when a line in the try block failed.';
  return null;
}

export function explainLine(code: string, number: number): ExplainedLine {
  const t = code.trim();
  if (!t) return { number, code, explanation: null, kind: 'blank' };
  if (t.startsWith('//')) return { number, code, explanation: `Comment (not run): ${t.replace(/^\/\/\s?/, '')}`, kind: 'comment' };
  const api = API_BY_LENGTH.find((a) => t.includes(`${a.name}(`) || t.includes(`${a.name}.`) || t.includes(`${a.name} `));
  if (api) {
    const prefix = /^(const|let|var)\s+(\w+)/.exec(t);
    const store = prefix ? ` The result is stored in "${prefix[2]}".` : '';
    const waits = /\bawait\b/.test(t) ? ' "await" makes the program wait until it is done.' : '';
    return { number, code, explanation: `${api.name}: ${api.description}${store}${waits}`, kind: 'api' };
  }
  const control = explainControl(t);
  if (control) return { number, code, explanation: control, kind: 'control' };
  const method = Object.entries(METHOD_HINTS).find(([m]) => t.includes(m));
  if (method) return { number, code, explanation: method[1], kind: 'api' };
  const variable = /^(const|let|var)\s+(\{[^}]*\}|\w+)/.exec(t);
  if (variable) return { number, code, explanation: `Creates ${variable[1] === 'const' ? 'a constant' : 'a variable'} ${variable[2]} to remember a value for later lines.`, kind: 'variable' };
  return { number, code, explanation: null, kind: t === '}' || t === '};' ? 'blank' : 'other' };
}

export function explainProgram(code: string): ExplainedLine[] {
  return code.split('\n').map((line, i) => explainLine(line, i + 1));
}

/** The documented API functions a program actually calls. */
export function apiUsage(code: string): string[] {
  return API_BY_LENGTH.filter((a) => code.includes(`${a.name}(`) || code.includes(`${a.name}.`)).map((a) => a.name);
}
