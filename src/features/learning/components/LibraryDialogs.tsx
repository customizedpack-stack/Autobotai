import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../../components/common/Button';
import { Modal } from '../../../components/common/Modal';
import { useProjectStore } from '../../../stores/projectStore';
import type { RobotProject } from '../../../types/project';
import { findTemplate } from '../../robot-library/templates';
import { findTutorial } from '../catalog/tutorials';
import { projectsFromDefinition } from '../engine/origins';

/** The project factory pulls in robot-model and Code Studio code: load it only when a project is created. */
const factory = () => import('../engine/projectFactory');
import type { ProjectDefinition } from '../model/types';
import { progressKey, useLearningStore } from '../store/learningStore';
import { tutorialHref } from './progressEntries';
import type { LibraryActions } from './useLibraryActions';

/** The dialogs behind the library actions (error, open robot, start tutorial). */
export function LibraryDialogs({ actions }: { actions: LibraryActions }) {
  const { dialog, error, setError, closeDialog, createRobot } = actions;
  return (
    <>
      <Modal open={error !== null} title="Could not create the project" onClose={() => setError(null)} footer={<Button onClick={() => setError(null)}>Close</Button>}>
        <p className="text-[13px] text-muted">{error}</p>
      </Modal>
      {dialog?.kind === 'robot' && <OpenRobotDialog def={dialog.def} onClose={closeDialog} onCreate={() => void createRobot(dialog.def)} />}
      {dialog?.kind === 'tutorial' && <StartTutorialDialog def={dialog.def} onClose={closeDialog} onError={setError} />}
    </>
  );
}

function OpenRobotDialog({ def, onClose, onCreate }: { def: ProjectDefinition; onClose: () => void; onCreate: () => void }) {
  const navigate = useNavigate();
  const robots = projectsFromDefinition(def.id, 'robot');
  return (
    <Modal open title={`Open ${def.name}`} onClose={onClose} footer={<Button onClick={onClose}>Cancel</Button>}>
      <p className="text-[13px] text-muted">You already made this robot. Open it, or create another one. Your existing project is not changed.</p>
      <ul className="mt-3 space-y-1.5">
        {robots.map((p) => (
          <li key={p.id}>
            <Button className="w-full justify-start" onClick={() => navigate(`/workspace/${p.id}`)} data-testid="open-existing-robot">
              Open "{p.name}"
            </Button>
          </li>
        ))}
      </ul>
      <Button variant="primary" className="mt-3 w-full" onClick={onCreate} data-testid="create-another-robot">
        Create a new ready-to-run robot
      </Button>
    </Modal>
  );
}

function StartTutorialDialog({ def, onClose, onError }: { def: ProjectDefinition; onClose: () => void; onError: (e: string) => void }) {
  const navigate = useNavigate();
  const tutorial = findTutorial(def.tutorialId);
  const progress = useLearningStore((s) => s.progress);
  const projects = useProjectStore((s) => s.projects);
  const [existingId, setExistingId] = useState('');
  if (!tutorial) return null;
  const inProgress = Object.values(progress).filter((p) => p.tutorialId === tutorial.id && projects[p.projectId]);
  const sameTemplate: RobotProject[] = Object.values(projects).filter((p) => p.templateId === def.templateId && !inProgress.some((x) => x.projectId === p.id));
  const templateName = findTemplate(def.templateId)?.name ?? def.templateId;

  const startNew = async () => {
    const r = (await factory()).createFromDefinition(def, { kind: 'tutorial', complete: false, name: `${def.name} (tutorial)` });
    if (!r.ok) return onError(r.error);
    navigate(tutorialHref(tutorial.id, r.project.id));
  };

  return (
    <Modal open title={`Start: ${tutorial.title}`} onClose={onClose} footer={<Button onClick={onClose}>Cancel</Button>}>
      <div className="space-y-4 text-[13px]" data-testid="start-tutorial-dialog">
        {inProgress.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-muted uppercase">Resume</h3>
            <ul className="mt-1.5 space-y-1.5">
              {inProgress.map((p) => (
                <li key={progressKey(p.tutorialId, p.projectId)}>
                  <Button className="w-full justify-start" onClick={() => navigate(tutorialHref(tutorial.id, p.projectId))} data-testid="resume-in-dialog">
                    Resume with "{projects[p.projectId]?.name}" (step {p.currentStep + 1} of {tutorial.steps.length})
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div>
          <h3 className="text-xs font-semibold text-muted uppercase">New project</h3>
          <p className="mt-1 text-xs text-muted">Creates a new {templateName} from the template. Nothing you already have is changed.</p>
          <Button variant="primary" className="mt-2 w-full" onClick={() => void startNew()} data-testid="start-new-tutorial">
            Start with a new project
          </Button>
        </div>
        {sameTemplate.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-muted uppercase">Use an existing project</h3>
            <p className="mt-1 text-xs text-muted">The tutorial checks this project as it is and never overwrites it, but the steps ask you to change it.</p>
            <div className="mt-2 flex gap-2">
              <label htmlFor="tutorial-existing" className="sr-only">
                Existing project
              </label>
              <select id="tutorial-existing" value={existingId} onChange={(e) => setExistingId(e.target.value)} className="h-9 min-w-0 flex-1 rounded-md border border-line bg-app px-2 text-[13px]">
                <option value="">Choose a project…</option>
                {sameTemplate.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <Button disabled={!existingId} onClick={() => navigate(tutorialHref(tutorial.id, existingId))}>
                Use it
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
