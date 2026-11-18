import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FolderOpen, Plus } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '../../components/common/Button';
import { EmptyState } from '../../components/common/EmptyState';
import { DeleteProjectDialog } from '../../components/dashboard/DeleteProjectDialog';
import { ProjectCard } from '../../components/dashboard/ProjectCard';
import { selectRecentProjects, useProjectStore } from '../../stores/projectStore';
import type { RobotProject } from '../../types/project';

export function ProjectsPage() {
  const navigate = useNavigate();
  const projects = useProjectStore(useShallow(selectRecentProjects));
  const [toDelete, setToDelete] = useState<RobotProject | null>(null);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="flex items-end justify-between border-b border-line pb-5">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">My Projects</h1>
          <p className="mt-1 text-[13px] text-muted">Local drafts saved in this browser. Cloud sync arrives in Phase 8.</p>
        </div>
        <Button variant="primary" icon={<Plus size={16} />} onClick={() => navigate('/new')}>
          New Robot
        </Button>
      </div>
      <div className="mt-6">
        {projects.length === 0 ? (
          <EmptyState
            icon={<FolderOpen size={18} />}
            title="No saved projects"
            description="Create a robot to see it listed here."
            action={
              <Button variant="primary" size="sm" onClick={() => navigate('/new')}>
                Create New Robot
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} onDelete={setToDelete} />
            ))}
          </div>
        )}
      </div>
      <DeleteProjectDialog project={toDelete} onClose={() => setToDelete(null)} />
    </div>
  );
}
