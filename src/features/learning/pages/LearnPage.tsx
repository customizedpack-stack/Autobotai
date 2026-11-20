import { Link } from 'react-router-dom';
import { GraduationCap, ScanSearch } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '../../../components/common/Button';
import { selectRecentProjects, useProjectStore } from '../../../stores/projectStore';
import { useSettingsStore } from '../../../stores/settingsStore';
import { PROJECT_DEFINITIONS } from '../catalog/projects';
import { findTutorial } from '../catalog/tutorials';
import { ExperienceModeSelect } from '../components/ExperienceModeSelect';
import { DifficultyBadge } from '../components/LibraryParts';
import { LibraryDialogs } from '../components/LibraryDialogs';
import { useLibraryActions } from '../components/useLibraryActions';
import { tutorialHref, useProgressEntries } from '../components/progressEntries';
import { EXPERIENCE_MODES, STAGE_LABEL } from '../model/types';

export default function LearnPage() {
  const actions = useLibraryActions();
  const entries = useProgressEntries();
  const mode = useSettingsStore((s) => s.experienceMode);
  const projects = useProjectStore(useShallow(selectRecentProjects));

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Learn Robotics</h1>
          <p className="mt-1 max-w-2xl text-[13px] text-muted">
            Each tutorial walks through nine stages. In every step you learn the idea, do it with the real controls, and the app checks your actual robot.
          </p>
        </div>
        <ExperienceModeSelect testId="learn-experience" compact />
      </div>
      <p className="mt-2 text-xs text-muted" data-testid="mode-description">
        {EXPERIENCE_MODES.find((m) => m.id === mode)?.label} Mode: {EXPERIENCE_MODES.find((m) => m.id === mode)?.description}
      </p>

      <section className="mt-6" aria-labelledby="tutorials-h">
        <h2 id="tutorials-h" className="mb-3 text-sm font-semibold">
          Guided tutorials
        </h2>
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2" data-testid="tutorial-list">
          {PROJECT_DEFINITIONS.map((def) => {
            const tutorial = findTutorial(def.tutorialId)!;
            const mine = entries.filter((e) => e.tutorial.id === tutorial.id);
            const latest = mine[0];
            return (
              <li key={def.id} className="rounded-lg border border-line bg-panel p-4" data-testid="tutorial-card" data-tutorial={tutorial.id}>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-[13px] font-semibold">{tutorial.title}</h3>
                  <DifficultyBadge difficulty={def.difficulty} />
                </div>
                <p className="mt-1 text-xs text-muted">{def.purpose}</p>
                <p className="mt-2 text-[11px] text-faint">
                  {tutorial.steps.length} steps: {Array.from(new Set(tutorial.steps.map((s) => STAGE_LABEL[s.stage]))).join(' · ')}
                </p>
                {latest && (
                  <p className="mt-2 text-[11px] text-muted">
                    {latest.progress.completedAt ? 'Completed' : `In progress: ${latest.done} of ${tutorial.steps.length} steps`} with "{latest.projectName}"
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  {latest && !latest.progress.completedAt ? (
                    <Link to={tutorialHref(tutorial.id, latest.progress.projectId)} className="inline-flex h-7 items-center gap-1.5 rounded-md border border-accent bg-accent px-2.5 text-xs font-medium text-white hover:bg-accent-strong">
                      <GraduationCap size={13} aria-hidden /> Resume
                    </Link>
                  ) : (
                    <Button size="sm" variant="primary" icon={<GraduationCap size={13} />} onClick={() => actions.startTutorial(def)} data-testid={`start-${tutorial.id}`}>
                      Start tutorial
                    </Button>
                  )}
                  <Link to={`/library/${def.slug}`} className="inline-flex h-7 items-center rounded-md border border-line bg-raised px-2.5 text-xs font-medium hover:bg-[#2c333e]">
                    Project details
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mt-8" aria-labelledby="reverse-h" data-testid="reverse-section">
        <h2 id="reverse-h" className="flex items-center gap-2 text-sm font-semibold">
          <ScanSearch size={15} className="text-accent" aria-hidden /> Reverse Engineering
        </h2>
        <p className="mt-1 max-w-2xl text-xs text-muted">
          Open a finished robot read-only and take it apart in your head: its parts, how they connect, its joints, its program and its build order. Nothing in the project is changed.
        </p>
        <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {PROJECT_DEFINITIONS.map((def) => (
            <li key={def.id}>
              <Button className="w-full justify-start" icon={<ScanSearch size={14} />} onClick={() => void actions.exploreExample(def)} data-testid={`reverse-${def.id}`}>
                Inspect the {def.name}
              </Button>
            </li>
          ))}
        </ul>
        {projects.length > 0 && (
          <div className="mt-3 text-xs text-muted">
            Or inspect one of your projects:{' '}
            {projects.slice(0, 6).map((p, i) => (
              <span key={p.id}>
                {i > 0 && ', '}
                <Link to={`/workspace/${p.id}?inspect=1`} className="text-accent hover:underline">
                  {p.name}
                </Link>
              </span>
            ))}
          </div>
        )}
      </section>
      <LibraryDialogs actions={actions} />
    </div>
  );
}
