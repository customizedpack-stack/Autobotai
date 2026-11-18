import { useSceneStore } from '../../stores/sceneStore';
import { log } from '../../utils/logger';
import { isProgramDirty, useCodeStudioStore } from './codeStudioStore';
import { programsForProject, uniqueProgramName, useProgramStore } from './storage/programStore';
import type { ProgramLanguage, RobotProgram } from './storage/programTypes';

/**
 * Program commands used by the toolbar, the program list and keyboard
 * shortcuts. Light module (no Blockly or editor code), so the workspace can
 * call it without loading Code Studio.
 */

const projectId = () => useSceneStore.getState().projectId;

export function activeProgram(): RobotProgram | null {
  const id = useCodeStudioStore.getState().activeProgramId;
  const pid = projectId();
  const program = id ? useProgramStore.getState().programs[id] : undefined;
  return program && program.projectId === pid ? program : null;
}

/** Open a program of the current project. Programs of other projects are refused. */
export function openProgram(programId: string): boolean {
  const pid = projectId();
  const program = useProgramStore.getState().programs[programId];
  if (!pid || !program || program.projectId !== pid) return false;
  useCodeStudioStore.getState().setActive(programId);
  useProgramStore.getState().setLastOpened(pid, programId);
  return true;
}

/** The program to show when Code Studio opens: the last opened one, else the newest, else a new starter of `language`. */
export function ensureActiveProgram(language: ProgramLanguage = 'blockly'): RobotProgram | null {
  const pid = projectId();
  if (!pid) return null;
  const current = activeProgram();
  if (current) return current;
  const { programs, lastOpened } = useProgramStore.getState();
  const last = lastOpened[pid] ? programs[lastOpened[pid]!] : undefined;
  const target = last && last.projectId === pid ? last : programsForProject(programs, pid)[0];
  if (target) {
    openProgram(target.id);
    return target;
  }
  return createProgram(language);
}

export function createProgram(language: ProgramLanguage, name?: string, source?: string): RobotProgram | null {
  const pid = projectId();
  if (!pid) return null;
  const result = useProgramStore.getState().createProgram({ projectId: pid, language, name, source });
  if (!result.ok) {
    log.error('code', result.error);
    return null;
  }
  openProgram(result.program.id);
  return result.program;
}

/** Switch the editor type: open the most recent program of that language, or create a starter one. */
export function switchLanguage(language: ProgramLanguage): RobotProgram | null {
  const pid = projectId();
  if (!pid) return null;
  if (activeProgram()?.language === language) return activeProgram();
  const existing = programsForProject(useProgramStore.getState().programs, pid).find((p) => p.language === language);
  if (existing) {
    openProgram(existing.id);
    return existing;
  }
  return createProgram(language);
}

export function saveProgram(programId: string): boolean {
  const pid = projectId();
  const store = useCodeStudioStore.getState();
  const draft = store.drafts[programId];
  if (!pid) return false;
  if (draft === undefined || !isProgramDirty(store, programId)) return true;
  const result = useProgramStore.getState().saveProgram(programId, pid, { source: draft });
  if (!result.ok) {
    log.error('code', `Could not save the program: ${result.error}`);
    return false;
  }
  store.setBaseline(programId, draft);
  store.clearDraft(programId);
  return true;
}

export function saveActiveProgram(): boolean {
  const program = activeProgram();
  if (!program) return false;
  if (!isProgramDirty(useCodeStudioStore.getState(), program.id)) {
    log.info('code', `"${program.name}" has no unsaved changes.`);
    return true;
  }
  return saveProgram(program.id);
}

/** Programs of the open project with unsaved edits. */
export function unsavedPrograms(): RobotProgram[] {
  const pid = projectId();
  const state = useCodeStudioStore.getState();
  const { programs } = useProgramStore.getState();
  return Object.keys(state.drafts)
    .filter((id) => isProgramDirty(state, id))
    .map((id) => programs[id])
    .filter((p): p is RobotProgram => Boolean(p) && p!.projectId === pid);
}

export function hasUnsavedPrograms(): boolean {
  return unsavedPrograms().length > 0;
}

export function saveAllPrograms(): boolean {
  return unsavedPrograms().every((p) => saveProgram(p.id));
}

/** Throw away unsaved edits of one program (editor "Revert"). */
export function revertProgram(programId: string): void {
  useCodeStudioStore.getState().clearDraft(programId);
}

export function renameProgram(programId: string, name: string): boolean {
  const pid = projectId();
  if (!pid) return false;
  const result = useProgramStore.getState().renameProgram(programId, pid, name);
  if (!result.ok) log.error('code', result.error);
  return result.ok;
}

export function duplicateProgram(programId: string): RobotProgram | null {
  const pid = projectId();
  if (!pid) return null;
  const original = useProgramStore.getState().programs[programId];
  if (!original || original.projectId !== pid) {
    log.error('code', 'This program belongs to a different project or no longer exists.');
    return null;
  }
  // The copy gets what the user sees (including unsaved edits); the original is NOT saved as a side effect.
  const source = useCodeStudioStore.getState().drafts[programId] ?? original.source;
  const name = uniqueProgramName(useProgramStore.getState().programs, pid, `Copy of ${original.name}`);
  const result = useProgramStore.getState().createProgram({ projectId: pid, language: original.language, source, description: original.description, name });
  if (!result.ok) {
    log.error('code', result.error);
    return null;
  }
  openProgram(result.program.id);
  return result.program;
}

export function deleteProgram(programId: string): boolean {
  const pid = projectId();
  if (!pid) return false;
  const ok = useProgramStore.getState().deleteProgram(programId, pid);
  if (!ok) return false;
  const store = useCodeStudioStore.getState();
  store.clearDraft(programId);
  if (store.activeProgramId === programId) {
    const next = programsForProject(useProgramStore.getState().programs, pid)[0];
    store.setActive(next?.id ?? null);
  }
  return true;
}

/** Forget open-editor state when a project closes. */
export function closeCodeStudioSession(): void {
  useCodeStudioStore.getState().clearAll();
}
