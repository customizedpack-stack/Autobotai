/**
 * Code Studio programs (Phase 4).
 *
 * Programs are stored SEPARATELY from robot projects (their own versioned
 * browser store, keyed by project id), so the RobotProject schema v3 does not
 * change. A program always belongs to exactly one project.
 */

export type ProgramLanguage = 'blockly' | 'javascript';

/** Version of the stored program format. Bump it and add a migration step when the shape changes. */
export const PROGRAM_SCHEMA_VERSION = 1;

export interface RobotProgram {
  id: string;
  /** The robot project this program belongs to. */
  projectId: string;
  name: string;
  description: string;
  language: ProgramLanguage;
  /**
   * The editable representation:
   * - blockly: Blockly workspace JSON (serialization.workspaces.save), as a string
   * - javascript: the JavaScript source text
   */
  source: string;
  /** Program format version (PROGRAM_SCHEMA_VERSION when saved). */
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProgramInput {
  projectId: string;
  name?: string;
  description?: string;
  language: ProgramLanguage;
  source?: string;
}

export const PROGRAM_NAME_MAX = 60;
/** Upper bound on stored source size, so one program cannot fill browser storage. */
export const PROGRAM_SOURCE_MAX = 200_000;
