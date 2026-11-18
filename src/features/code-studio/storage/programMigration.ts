import { PROGRAM_SCHEMA_VERSION, type ProgramLanguage, type RobotProgram } from './programTypes';

/**
 * Migration and repair for the stored Code Studio programs.
 * Version 1 is the first format. Unknown or broken entries are not loaded,
 * but they are reported (never silently discarded without a message).
 */

export interface ProgramMigrationResult {
  programs: Record<string, RobotProgram>;
  warnings: string[];
}

const LANGUAGES: readonly ProgramLanguage[] = ['blockly', 'javascript'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Repair one stored program. Returns null when it cannot be used (no id, project, language or source). */
export function normalizeProgram(raw: unknown, warnings: string[]): RobotProgram | null {
  if (!isRecord(raw)) {
    warnings.push('A stored program was not readable and was skipped.');
    return null;
  }
  const id = typeof raw.id === 'string' && raw.id ? raw.id : null;
  const projectId = typeof raw.projectId === 'string' && raw.projectId ? raw.projectId : null;
  const language = LANGUAGES.includes(raw.language as ProgramLanguage) ? (raw.language as ProgramLanguage) : null;
  if (!id || !projectId || !language || typeof raw.source !== 'string') {
    warnings.push(`Program "${String(raw.name ?? raw.id ?? 'unknown')}" is missing required data and was skipped.`);
    return null;
  }
  const now = new Date().toISOString();
  return {
    id,
    projectId,
    language,
    source: raw.source,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name : 'Untitled program',
    description: typeof raw.description === 'string' ? raw.description : '',
    version: PROGRAM_SCHEMA_VERSION,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : now,
  };
}

/** Migrate the persisted store from `fromVersion` to the current version. */
export function migratePrograms(persisted: unknown, fromVersion: number): ProgramMigrationResult {
  const warnings: string[] = [];
  const programs: Record<string, RobotProgram> = {};
  const source = isRecord(persisted) && isRecord(persisted.programs) ? persisted.programs : {};
  if (fromVersion > PROGRAM_SCHEMA_VERSION) {
    warnings.push(`Programs were saved by a newer version (v${fromVersion}). They are loaded as far as possible.`);
  }
  for (const raw of Object.values(source)) {
    const program = normalizeProgram(raw, warnings);
    if (program) programs[program.id] = program;
  }
  return { programs, warnings };
}
