import { useProjectStore } from '../../stores/projectStore';
import type { RobotProject } from '../../types/project';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';

export function DeleteProjectDialog({ project, onClose }: { project: RobotProject | null; onClose: () => void }) {
  const deleteProject = useProjectStore((s) => s.deleteProject);
  return (
    <Modal
      open={project !== null}
      title="Delete project"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="danger"
            onClick={() => {
              if (project) deleteProject(project.id);
              onClose();
            }}
          >
            Delete project
          </Button>
        </>
      }
    >
      <p className="text-[13px] text-muted">
        Delete <span className="font-semibold text-ink">{project?.name}</span> from this browser? This cannot be undone.
      </p>
    </Modal>
  );
}
