import { Link } from 'react-router-dom';
import { Boxes, Trash2 } from 'lucide-react';
import { categoryLabel } from '../../features/robot-library/templates';
import type { RobotProject } from '../../types/project';
import { formatRelativeTime } from '../../utils/format';
import { IconButton } from '../common/Button';
import { RobotThumbnail } from './RobotThumbnail';

interface ProjectCardProps {
  project: RobotProject;
  onDelete: (project: RobotProject) => void;
}

export function ProjectCard({ project, onDelete }: ProjectCardProps) {
  return (
    <div className="group relative overflow-hidden rounded-lg border border-line bg-panel transition-colors hover:border-[#3d4553]">
      <Link to={`/workspace/${project.id}`} className="block" aria-label={`Open ${project.name}`}>
        <div className="aspect-[16/8] border-b border-line-soft">
          <RobotThumbnail category={project.category} templateId={project.templateId} />
        </div>
        <div className="p-3">
          <div className="truncate text-[13px] font-semibold">{project.name}</div>
          <div className="mt-1 flex items-center gap-2 text-[11.5px] text-muted">
            <span>{categoryLabel(project.category)}</span>
            <span className="text-faint">·</span>
            <span className="inline-flex items-center gap-1">
              <Boxes size={11} />
              {project.objects.length} objects
            </span>
          </div>
          <div className="mt-1 text-[11px] text-faint">Saved {formatRelativeTime(project.savedAt)}</div>
        </div>
      </Link>
      <IconButton
        label={`Delete ${project.name}`}
        className="absolute top-2 right-2 bg-panel/80 opacity-0 group-hover:opacity-100 focus:opacity-100"
        onClick={() => onDelete(project)}
      >
        <Trash2 size={14} />
      </IconButton>
    </div>
  );
}
