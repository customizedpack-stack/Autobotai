import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { projectsFromDefinition } from '../engine/origins';

/** The project factory pulls in robot-model and Code Studio code: load it only when a project is created. */
const factory = () => import('../engine/projectFactory');
import type { ProjectDefinition } from '../model/types';

export type LibraryDialog = { kind: 'tutorial' | 'robot'; def: ProjectDefinition } | null;

export interface LibraryActions {
  exploreExample: (def: ProjectDefinition) => Promise<void>;
  openRobot: (def: ProjectDefinition) => void;
  createRobot: (def: ProjectDefinition) => Promise<void>;
  startTutorial: (def: ProjectDefinition) => void;
  dialog: LibraryDialog;
  closeDialog: () => void;
  error: string | null;
  setError: (error: string | null) => void;
}

/** Library actions shared by the Learn, Library, Detail and Robot Builder pages. Render <LibraryDialogs actions={…} /> with it. */
export function useLibraryActions(): LibraryActions {
  const navigate = useNavigate();
  const [dialog, setDialog] = useState<LibraryDialog>(null);
  const [error, setError] = useState<string | null>(null);

  /** Explore Project: a finished example robot, opened read-only in Reverse Engineering inspection. */
  const exploreExample = async (def: ProjectDefinition) => {
    let project = projectsFromDefinition(def.id, 'example')[0];
    if (!project) {
      const r = (await factory()).createFromDefinition(def, { kind: 'example', complete: true });
      if (!r.ok) return setError(r.error);
      project = r.project;
    }
    navigate(`/workspace/${project.id}?inspect=1`);
  };

  /** Open Robot: a NEW ready-to-run project (template + setup + starter program). */
  const createRobot = async (def: ProjectDefinition) => {
    const r = (await factory()).createFromDefinition(def, { kind: 'robot', complete: true });
    if (!r.ok) return setError(r.error);
    setDialog(null);
    navigate(`/workspace/${r.project.id}`);
  };

  const openRobot = (def: ProjectDefinition) => {
    if (projectsFromDefinition(def.id, 'robot').length > 0) setDialog({ kind: 'robot', def });
    else void createRobot(def);
  };

  return { exploreExample, openRobot, createRobot, startTutorial: (def) => setDialog({ kind: 'tutorial', def }), dialog, closeDialog: () => setDialog(null), error, setError };
}
