import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Bot, Boxes, Code2, FolderOpen, Play, Plus } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { EmptyState } from '../../components/common/EmptyState';
import { DeleteProjectDialog } from '../../components/dashboard/DeleteProjectDialog';
import { ProjectCard } from '../../components/dashboard/ProjectCard';
import { TemplateCard } from '../../components/dashboard/TemplateCard';
import { FEATURED_TEMPLATES } from '../../features/robot-library/templates';
import { selectRecentProjects, useProjectStore } from '../../stores/projectStore';
import type { RobotProject } from '../../types/project';

const JOURNEY = [
  { icon: <Boxes size={15} />, title: 'Design', text: '3D workspace, parts, joints and motors', status: 'Available', tone: 'ok' as const },
  { icon: <Code2 size={15} />, title: 'Program', text: 'Blockly blocks and JavaScript in Code Studio', status: 'Available', tone: 'ok' as const },
  { icon: <Play size={15} />, title: 'Simulate', text: 'Rigid-body physics, sensors and your own test environments', status: 'Available', tone: 'ok' as const },
  { icon: <Bot size={15} />, title: 'AI Brain', text: 'Talk to your robot, AI vision and autonomy', status: 'Phase J', tone: 'neutral' as const },
];

export function DashboardPage() {
  const navigate = useNavigate();
  const projects = useProjectStore(useShallow(selectRecentProjects));
  const [toDelete, setToDelete] = useState<RobotProject | null>(null);
  const recent = projects.slice(0, 6);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <section className="flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold tracking-wider text-accent uppercase">Robotics workspace</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Build. Code. Simulate. Innovate.</h1>
          <p className="mt-1.5 max-w-xl text-[13px] text-muted">
            Design your own robot in 3D, program it, and test it in a virtual lab without any hardware.
          </p>
        </div>
        <Button variant="primary" icon={<Plus size={16} />} onClick={() => navigate('/new')}>
          Create New Robot
        </Button>
      </section>

      <section className="mt-6 grid grid-cols-2 gap-2 lg:grid-cols-4" aria-label="Platform journey">
        {JOURNEY.map((step) => (
          <div key={step.title} className="rounded-lg border border-line bg-panel p-3">
            <div className="flex items-center justify-between">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-raised text-muted">{step.icon}</span>
              <Badge tone={step.tone}>{step.status}</Badge>
            </div>
            <div className="mt-2.5 text-[13px] font-semibold">{step.title}</div>
            <div className="text-xs text-muted">{step.text}</div>
          </div>
        ))}
      </section>

      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">
            Recent projects <span className="ml-1 font-normal text-faint">{projects.length}</span>
          </h2>
          {projects.length > 0 && (
            <Link to="/projects" className="inline-flex items-center gap-1 text-xs text-muted hover:text-ink">
              View all <ArrowRight size={12} />
            </Link>
          )}
        </div>
        {recent.length === 0 ? (
          <EmptyState
            icon={<FolderOpen size={18} />}
            title="No robots yet"
            description="Your projects appear here after you create one. Start from a template or a blank robot."
            action={
              <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => navigate('/new')}>
                Create your first robot
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {recent.map((project) => (
              <ProjectCard key={project.id} project={project} onDelete={setToDelete} />
            ))}
          </div>
        )}
      </section>

      <section className="mt-8">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">Robot templates</h2>
          <span className="text-[11px] text-faint">Sample starter designs, not saved projects</span>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURED_TEMPLATES.map((template) => (
            <TemplateCard key={template.id} template={template} />
          ))}
        </div>
      </section>

      <DeleteProjectDialog project={toDelete} onClose={() => setToDelete(null)} />
    </div>
  );
}
