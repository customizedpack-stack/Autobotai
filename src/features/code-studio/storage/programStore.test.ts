import { beforeEach, describe, expect, it } from 'vitest';
import { useProjectStore } from '../../../stores/projectStore';
import { useSceneStore } from '../../../stores/sceneStore';
import { openExplorer } from '../../controls/testUtils';
import { useCodeStudioStore, isProgramDirty } from '../codeStudioStore';
import {
  activeProgram,
  createProgram,
  deleteProgram,
  duplicateProgram,
  ensureActiveProgram,
  hasUnsavedPrograms,
  openProgram,
  renameProgram,
  saveActiveProgram,
  switchLanguage,
} from '../programActions';
import '../testUtils';
import { migratePrograms } from './programMigration';
import { programsForProject, useProgramStore } from './programStore';
import { PROGRAM_SCHEMA_VERSION } from './programTypes';
import { STARTER_JAVASCRIPT } from './starterPrograms';

let projectId = '';
beforeEach(() => {
  useProgramStore.setState({ programs: {}, lastOpened: {} });
  useCodeStudioStore.getState().clearAll();
  projectId = openExplorer(false).id;
});

describe('program storage', () => {
  it('creates a program with starter content, linked to the open project', () => {
    const program = createProgram('javascript')!;
    expect(program).toMatchObject({ projectId, language: 'javascript', name: 'JavaScript program', source: STARTER_JAVASCRIPT, version: PROGRAM_SCHEMA_VERSION });
    expect(activeProgram()?.id).toBe(program.id);
    const blocks = createProgram('blockly')!;
    expect(JSON.parse(blocks.source).blocks.blocks[0].type).toBe('robot_start');
  });

  it('saves edits (draft → saved) and tracks unsaved changes', () => {
    const program = createProgram('javascript')!;
    const studio = useCodeStudioStore.getState();
    studio.setBaseline(program.id, program.source);
    studio.setDraft(program.id, program.source);
    expect(isProgramDirty(useCodeStudioStore.getState(), program.id)).toBe(false);
    studio.setDraft(program.id, 'await robotControl.stop();');
    expect(hasUnsavedPrograms()).toBe(true);
    expect(saveActiveProgram()).toBe(true);
    expect(useProgramStore.getState().programs[program.id]!.source).toBe('await robotControl.stop();');
    expect(hasUnsavedPrograms()).toBe(false);
  });

  it('reopens saved programs after a reload (persisted in browser storage)', async () => {
    const program = createProgram('javascript', 'Patrol')!;
    const raw = localStorage.getItem('arai.programs.v1')!;
    const stored = JSON.parse(raw);
    expect(stored.version).toBe(PROGRAM_SCHEMA_VERSION);
    expect(stored.state.programs[program.id].name).toBe('Patrol');
    // Simulate a page reload: memory is empty, browser storage still has the saved data.
    useProgramStore.setState({ programs: {}, lastOpened: {} });
    localStorage.setItem('arai.programs.v1', raw);
    await useProgramStore.persist.rehydrate();
    expect(useProgramStore.getState().programs[program.id]?.name).toBe('Patrol');
    useCodeStudioStore.getState().clearAll();
    expect(ensureActiveProgram()?.id).toBe(program.id);
  });

  it('renames with validation (empty and duplicate names refused)', () => {
    const a = createProgram('javascript', 'Alpha')!;
    createProgram('javascript', 'Beta');
    expect(renameProgram(a.id, '  Gamma ')).toBe(true);
    expect(useProgramStore.getState().programs[a.id]!.name).toBe('Gamma');
    expect(renameProgram(a.id, '   ')).toBe(false);
    expect(renameProgram(a.id, 'beta')).toBe(false);
  });

  it('duplicates and deletes programs', () => {
    const a = createProgram('javascript', 'Alpha')!;
    const copy = duplicateProgram(a.id)!;
    expect(copy.name).toBe('Copy of Alpha');
    expect(copy.source).toBe(a.source);
    expect(duplicateProgram(a.id)!.name).toBe('Copy of Alpha (2)');
    expect(deleteProgram(copy.id)).toBe(true);
    expect(useProgramStore.getState().programs[copy.id]).toBeUndefined();
  });

  it('keeps programs associated with their project', () => {
    const mine = createProgram('javascript', 'Mine')!;
    const other = useProjectStore.getState().createProject({ name: 'Other', category: 'mobile', templateId: 'explorer-bot' });
    const store = useProgramStore.getState();
    const foreign = store.createProgram({ projectId: other.id, language: 'javascript', name: 'Theirs' });
    expect(foreign.ok).toBe(true);
    const foreignId = foreign.ok ? foreign.program.id : '';
    expect(programsForProject(useProgramStore.getState().programs, projectId).map((p) => p.name)).toEqual(['Mine']);
    // Operations through the open project cannot touch another project's program.
    expect(openProgram(foreignId)).toBe(false);
    expect(store.saveProgram(foreignId, projectId, { source: 'x' })).toEqual({ ok: false, error: 'This program belongs to a different project.' });
    expect(store.deleteProgram(foreignId, projectId)).toBe(false);
    expect(store.renameProgram(foreignId, projectId, 'Hacked').ok).toBe(false);
    expect(useProgramStore.getState().programs[mine.id]!.projectId).toBe(projectId);
    // Deleting a project deletes its programs only.
    useProjectStore.getState().deleteProject(other.id);
    expect(useProgramStore.getState().programs[foreignId]).toBeUndefined();
    expect(useProgramStore.getState().programs[mine.id]).toBeDefined();
  });

  it('switching language opens or creates a program of that type', () => {
    const js = switchLanguage('javascript')!;
    expect(js.language).toBe('javascript');
    const blocks = switchLanguage('blockly')!;
    expect(blocks.language).toBe('blockly');
    expect(switchLanguage('javascript')!.id).toBe(js.id);
  });

  it('migration repairs or skips broken stored programs and reports them', () => {
    const result = migratePrograms(
      {
        programs: {
          a: { id: 'a', projectId: 'p', language: 'javascript', source: 'x' },
          b: { id: 'b', projectId: 'p', language: 'python', source: 'x', name: 'Py' },
          c: 'garbage',
        },
      },
      1,
    );
    expect(Object.keys(result.programs)).toEqual(['a']);
    expect(result.programs.a).toMatchObject({ name: 'Untitled program', description: '', version: PROGRAM_SCHEMA_VERSION });
    expect(result.warnings).toHaveLength(2);
  });

  it('existing robot projects are unchanged (schema v3) and still open', () => {
    createProgram('javascript');
    const project = useProjectStore.getState().projects[projectId]!;
    expect(project.schemaVersion).toBe(3);
    expect(Object.keys(project)).not.toContain('programs');
    expect(useSceneStore.getState().projectId).toBe(projectId);
  });
});
