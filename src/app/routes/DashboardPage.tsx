import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, FolderOpen, GraduationCap, Library, Plus, Wand2 } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '../../components/common/Button';
import { EmptyState } from '../../components/common/EmptyState';
import { DeleteProjectDialog } from '../../components/dashboard/DeleteProjectDialog';
import { ProjectCard } from '../../components/dashboard/ProjectCard';
import { TemplateCard } from '../../components/dashboard/TemplateCard';
import { ContinueLearning, LearningProgressSummary } from '../../features/learning/components/LearningProgress';
import { ExperienceChooser } from '../../features/learning/components/ExperienceChooser';
import { FEATURED_TEMPLATES } from '../../features/robot-library/templates';
import { selectRecentProjects, useProjectStore } from '../../stores/projectStore';
import { useSettingsStore } from '../../stores/settingsStore';
import type { RobotProject } from '../../types/project';

const ACTIONS = [
  { to: '/learn', icon: <GraduationCap size={16} aria-hidden />, title: 'Start Learning', text: 'Guided tutorials: learn, do, and check your robot step by step.', testId: 'action-learn' },
  { to: '/library', icon: <Library size={16} aria-hidden />, title: 'Explore Projects', text: 'Six robotics projects with honest support status for simulation and hardware.', testId: 'action-library' },
  { to: '/new', icon: <Plus size={16} aria-hidden />, title: 'Create a Robot', text: 'Start from a template or a blank robot in the full workspace.', testId: 'action-create' },
];

export function DashboardPage() {
  const navigate = useNavigate();
  const projects = useProjectStore(useShallow(selectRecentProjects));
  const chosen = useSettingsStore((s) => s.experienceChosen);
  const [toDelete, setToDelete] = useState<RobotProject | null>(null);
  const [goal, setGoal] = useState('');
  const recent = projects.slice(0, 6);

  const submitGoal = (event: FormEvent) => {
    event.preventDefault();
    navigate(goal.trim() ? `/builder?goal=${encodeURIComponent(goal.trim())}` : '/builder');
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <section className="flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold tracking-wider text-accent uppercase">Welcome to AutoBotAI</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Build. Code. Simulate. Innovate.</h1>
          <p className="mt-1.5 max-w-xl text-[13px] text-muted">Learn robotics by building real robot projects in 3D, programming them and testing them in simulation.</p>
        </div>
        <Button variant="primary" icon={<Plus size={16} />} onClick={() => navigate('/new')}>
          Create New Robot
        </Button>
      </section>

      {!chosen && <ExperienceChooser />}

      <section className="mt-6 rounded-lg border border-line bg-panel p-4" aria-labelledby="goal-heading">
        <h2 id="goal-heading" className="flex items-center gap-2 text-sm font-semibold">
          <Wand2 size={15} className="text-accent" aria-hidden /> What do you want to build?
        </h2>
        <form onSubmit={submitGoal} className="mt-2 flex flex-col gap-2 sm:flex-row">
          <label htmlFor="dashboard-goal" className="sr-only">
            Describe what your robot should do
          </label>
          <input
            id="dashboard-goal"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="For example: a robot that drives around my room without bumping into things"
            maxLength={300}
            className="h-9 min-w-0 flex-1 rounded-md border border-line bg-app px-3 text-[13px] outline-none focus:border-accent"
            data-testid="dashboard-goal"
          />
          <Button type="submit" variant="primary" data-testid="dashboard-goal-submit">
            Find a project
          </Button>
        </form>
      </section>

      <section className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3" aria-label="Next steps">
        {ACTIONS.map((a) => (
          <Link key={a.to} to={a.to} data-testid={a.testId} className="group rounded-lg border border-line bg-panel p-3 transition-colors hover:border-[#3d4553]">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-raised text-muted group-hover:text-ink">{a.icon}</span>
            <div className="mt-2 flex items-center gap-1 text-[13px] font-semibold">
              {a.title} <ArrowRight size={12} className="text-faint" aria-hidden />
            </div>
            <div className="text-xs text-muted">{a.text}</div>
          </Link>
        ))}
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_280px]">
        <ContinueLearning />
        <LearningProgressSummary />
      </div>

      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">
            My Recent Projects <span className="ml-1 font-normal text-faint">{projects.length}</span>
          </h2>
          {projects.length > 0 && (
            <Link to="/projects" className="inline-flex items-center gap-1 text-xs text-muted hover:text-ink">
              View all <ArrowRight size={12} aria-hidden />
            </Link>
          )}
        </div>
        {recent.length === 0 ? (
          <EmptyState
            icon={<FolderOpen size={18} />}
            title="No robots yet"
            description="Your projects appear here after you create one. Start a guided project from the library, or create a robot from a template."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button size="sm" icon={<Library size={14} />} onClick={() => navigate('/library')}>
                  Browse the Project Library
                </Button>
                <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => navigate('/new')}>
                  Create your first robot
                </Button>
              </div>
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
          <h2 className="text-sm font-semibold">Start from a template</h2>
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
