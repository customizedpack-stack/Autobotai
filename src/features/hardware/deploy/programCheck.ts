import { programHash } from '../protocol/protocol';

/**
 * "Build / Prepare Program" for the physical robot.
 *
 * Programs are NOT sent to the ESP32 and do not run there. They keep running in
 * the browser's code sandbox, and only allowlisted, limited motion commands reach
 * the device through the Command Bus and the Physical Hardware Adapter. Preparing
 * checks that the program only uses what the physical Explorer Bot supports and
 * computes a hash; Deploy registers that hash on the device, and Start runs only
 * that exact program.
 */

export interface ProgramCheckIssue {
  message: string;
  line?: number;
  severity: 'error' | 'warning';
}

export interface PreparedProgram {
  programId: string;
  name: string;
  language: 'blockly' | 'javascript';
  hash: string;
  preparedAt: string;
  issues: ProgramCheckIssue[];
  ok: boolean;
}

const UNSUPPORTED: { re: RegExp; message: string }[] = [
  { re: /robotControl\s*\.\s*joint\b/, message: 'Joint commands are not supported on the physical Explorer Bot (it has no actuated joints besides the wheels).' },
  { re: /\brobot\s*\.\s*(joints|jointInfo|waitForJoint)\b/, message: 'Joint functions are not supported on the physical Explorer Bot.' },
  { re: /robotSensors\s*\.\s*(encoder|imu)\b/, message: 'The reference robot has no wheel encoders or IMU: encoder and IMU readings are not available on the physical robot.' },
  { re: /robotSensors\s*\.\s*odometry\b/, message: 'Odometry needs wheel encoders, which the reference robot does not have.' },
  { re: /\brobotCamera\b/, message: 'Cameras are simulation-only in this version; the reference robot has no camera.' },
  { re: /robotControl\s*\.\s*reset\b/, message: 'reset() moves the simulated robot back to its design pose; a physical robot cannot do that. Use stop().' },
  { re: /\.\s*subscribe\s*\(/, message: 'subscribe() is not available on the physical robot in this version. Use read() in a loop with wait().' },
  { re: /\.\s*waitForReading\s*\(/, message: 'waitForReading() is not available on the physical robot in this version. Use read() in a loop with wait().' },
];

/** Remove comments so they do not trigger the checks (strings are left as they are). */
function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/\/\/[^\n]*/g, '');
}

export function checkPhysicalProgram(code: string): ProgramCheckIssue[] {
  const issues: ProgramCheckIssue[] = [];
  const lines = stripComments(code).split('\n');
  lines.forEach((text, i) => {
    for (const rule of UNSUPPORTED) if (rule.re.test(text)) issues.push({ message: rule.message, line: i + 1, severity: 'error' });
  });
  if (!/robotControl\s*\.\s*(drive|turn|stop)\b/.test(code)) issues.push({ message: 'The program does not drive the robot.', severity: 'warning' });
  return issues;
}

export function prepareProgram(input: { programId: string; name: string; language: 'blockly' | 'javascript'; code: string }): PreparedProgram {
  const issues = checkPhysicalProgram(input.code);
  return { programId: input.programId, name: input.name, language: input.language, hash: programHash(input.code), preparedAt: new Date().toISOString(), issues, ok: !issues.some((i) => i.severity === 'error') };
}
