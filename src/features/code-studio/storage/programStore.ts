import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { bus } from '../../../core/bus/connectorBus';
import { createId } from '../../../utils/id';
import { log } from '../../../utils/logger';
import { safeStorage } from '../../../utils/storage';
import { migratePrograms } from './programMigration';
import { PROGRAM_NAME_MAX, PROGRAM_SCHEMA_VERSION, PROGRAM_SOURCE_MAX, type ProgramInput, type RobotProgram } from './programTypes';
import { STARTER_JAVASCRIPT, starterBlocklyWorkspace } from './starterPrograms';

/**
 * Saved Code Studio programs (browser storage key `arai.programs.v1`).
 * Kept apart from robot projects so schema v3 is unchanged; every program
 * carries its projectId and every operation checks it.
 */

export type ProgramResult = { ok: true; program: RobotProgram } | { ok: false; error: string };

interface ProgramState {
  programs: Record<string, RobotProgram>;
  /** Last opened program per project. */
  lastOpened: Record<string, string>;

  createProgram: (input: ProgramInput) => ProgramResult;
  saveProgram: (id: string, projectId: string, patch: { source?: string; description?: string }) => ProgramResult;
  renameProgram: (id: string, projectId: string, name: string) => ProgramResult;
  duplicateProgram: (id: string, projectId: string) => ProgramResult;
  deleteProgram: (id: string, projectId: string) => boolean;
  deleteProjectPrograms: (projectId: string) => number;
  setLastOpened: (projectId: string, programId: string) => void;
}

function cleanName(name: string | undefined, fallback: string): string {
  const trimmed = (name ?? '').trim().slice(0, PROGRAM_NAME_MAX);
  return trimmed || fallback;
}

/** Programs of one project, most recently updated first. */
export function programsForProject(programs: Record<string, RobotProgram>, projectId: string): RobotProgram[] {
  return Object.values(programs)
    .filter((p) => p.projectId === projectId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.name.localeCompare(b.name));
}

/** Most attempts at a numbered name before falling back to a random suffix. */
export const MAX_NAME_ATTEMPTS = 10_000;

/** `base` shortened so that `suffix` still fits in PROGRAM_NAME_MAX characters. */
function withSuffix(base: string, suffix: string): string {
  return `${base.slice(0, Math.max(0, PROGRAM_NAME_MAX - suffix.length)).trimEnd()}${suffix}`;
}

/**
 * A name that is not used yet in this project ("Program", "Program (2)", …).
 * The numeric suffix always fits: the BASE is shortened, never the suffix, so every
 * attempt produces a different name. Comparison ignores upper/lower case.
 * After MAX_NAME_ATTEMPTS numbered names, a short random suffix is used.
 */
export function uniqueProgramName(programs: Record<string, RobotProgram>, projectId: string, base: string): string {
  const used = new Set(programsForProject(programs, projectId).map((p) => p.name.toLowerCase()));
  const start = base.slice(0, PROGRAM_NAME_MAX).trimEnd() || 'Program';
  if (!used.has(start.toLowerCase())) return start;
  for (let n = 2; n <= MAX_NAME_ATTEMPTS; n += 1) {
    const candidate = withSuffix(start, ` (${n})`);
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
  // Fallback: random suffixes (checked against existing names), then a time-based one. Always terminates.
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const candidate = withSuffix(start, ` (${createId('n').slice(-6)})`);
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
  return withSuffix(start, ` (${Date.now().toString(36)})`);
}

export const useProgramStore = create<ProgramState>()(
  persist(
    (set, get) => {
      /** Find a program and make sure it belongs to the given project. */
      const owned = (id: string, projectId: string): RobotProgram | { error: string } => {
        const program = get().programs[id];
        if (!program) return { error: 'This program no longer exists.' };
        if (program.projectId !== projectId) return { error: 'This program belongs to a different project.' };
        return program;
      };
      const put = (program: RobotProgram) => set((s) => ({ programs: { ...s.programs, [program.id]: program } }));

      return {
        programs: {},
        lastOpened: {},

        createProgram: (input) => {
          if (!input.projectId) return { ok: false, error: 'Open a robot project first.' };
          const source = input.source ?? (input.language === 'blockly' ? starterBlocklyWorkspace() : STARTER_JAVASCRIPT);
          if (source.length > PROGRAM_SOURCE_MAX) return { ok: false, error: 'This program is too large to save.' };
          const now = new Date().toISOString();
          const base = input.language === 'blockly' ? 'Blocks program' : 'JavaScript program';
          const program: RobotProgram = {
            id: createId('prg'),
            projectId: input.projectId,
            name: uniqueProgramName(get().programs, input.projectId, cleanName(input.name, base)),
            description: input.description ?? '',
            language: input.language,
            source,
            version: PROGRAM_SCHEMA_VERSION,
            createdAt: now,
            updatedAt: now,
          };
          put(program);
          bus.publish('codeStudio.programChanged', { programId: program.id, projectId: program.projectId, change: 'created' });
          log.success('code', `Created program "${program.name}".`);
          return { ok: true, program };
        },

        saveProgram: (id, projectId, patch) => {
          const found = owned(id, projectId);
          if ('error' in found) return { ok: false, error: found.error };
          if (patch.source !== undefined && patch.source.length > PROGRAM_SOURCE_MAX) return { ok: false, error: 'This program is too large to save.' };
          const program: RobotProgram = {
            ...found,
            source: patch.source ?? found.source,
            description: patch.description ?? found.description,
            version: PROGRAM_SCHEMA_VERSION,
            updatedAt: new Date().toISOString(),
          };
          put(program);
          bus.publish('codeStudio.programChanged', { programId: id, projectId, change: 'saved' });
          log.success('code', `Saved program "${program.name}".`);
          return { ok: true, program };
        },

        renameProgram: (id, projectId, name) => {
          const found = owned(id, projectId);
          if ('error' in found) return { ok: false, error: found.error };
          const trimmed = name.trim().slice(0, PROGRAM_NAME_MAX);
          if (!trimmed) return { ok: false, error: 'A program needs a name.' };
          if (trimmed === found.name) return { ok: true, program: found };
          const clash = programsForProject(get().programs, projectId).some((p) => p.id !== id && p.name.toLowerCase() === trimmed.toLowerCase());
          if (clash) return { ok: false, error: `A program named "${trimmed}" already exists in this project.` };
          const program = { ...found, name: trimmed, updatedAt: new Date().toISOString() };
          put(program);
          bus.publish('codeStudio.programChanged', { programId: id, projectId, change: 'renamed' });
          log.info('code', `Renamed program to "${trimmed}".`);
          return { ok: true, program };
        },

        duplicateProgram: (id, projectId) => {
          const found = owned(id, projectId);
          if ('error' in found) return { ok: false, error: found.error };
          return get().createProgram({
            projectId,
            language: found.language,
            source: found.source,
            description: found.description,
            name: uniqueProgramName(get().programs, projectId, `Copy of ${found.name}`.slice(0, PROGRAM_NAME_MAX)),
          });
        },

        deleteProgram: (id, projectId) => {
          const found = owned(id, projectId);
          if ('error' in found) return false;
          set((s) => {
            const programs = { ...s.programs };
            delete programs[id];
            const lastOpened = { ...s.lastOpened };
            if (lastOpened[projectId] === id) delete lastOpened[projectId];
            return { programs, lastOpened };
          });
          bus.publish('codeStudio.programChanged', { programId: id, projectId, change: 'deleted' });
          log.warning('code', `Deleted program "${found.name}".`);
          return true;
        },

        deleteProjectPrograms: (projectId) => {
          const ids = programsForProject(get().programs, projectId).map((p) => p.id);
          if (ids.length === 0) return 0;
          set((s) => {
            const programs = { ...s.programs };
            for (const id of ids) delete programs[id];
            const lastOpened = { ...s.lastOpened };
            delete lastOpened[projectId];
            return { programs, lastOpened };
          });
          return ids.length;
        },

        setLastOpened: (projectId, programId) => {
          if (get().lastOpened[projectId] === programId) return;
          set((s) => ({ lastOpened: { ...s.lastOpened, [projectId]: programId } }));
        },
      };
    },
    {
      name: 'arai.programs.v1',
      storage: safeStorage,
      version: PROGRAM_SCHEMA_VERSION,
      partialize: (s) => ({ programs: s.programs, lastOpened: s.lastOpened }),
      migrate: (persisted, version) => {
        const result = migratePrograms(persisted, version);
        for (const warning of result.warnings) log.warning('storage', warning);
        const lastOpened = ((persisted ?? {}) as { lastOpened?: Record<string, string> }).lastOpened ?? {};
        return { programs: result.programs, lastOpened };
      },
      // Repair stored entries on every load, even when the version did not change.
      merge: (persisted, current) => {
        const result = migratePrograms(persisted, PROGRAM_SCHEMA_VERSION);
        for (const warning of result.warnings) log.warning('storage', warning);
        const stored = (persisted ?? {}) as { lastOpened?: unknown };
        const lastOpened = stored.lastOpened && typeof stored.lastOpened === 'object' ? (stored.lastOpened as Record<string, string>) : {};
        return { ...current, programs: result.programs, lastOpened };
      },
    },
  ),
);

let connected = false;

/** Delete a project's programs when the project is deleted. Safe to call more than once. */
export function connectProgramStore(): void {
  if (connected) return;
  connected = true;
  bus.subscribe('project.deleted', ({ projectId }) => {
    const removed = useProgramStore.getState().deleteProjectPrograms(projectId);
    if (removed > 0) log.info('code', `Deleted ${removed} program(s) that belonged to the deleted project.`);
  });
}
