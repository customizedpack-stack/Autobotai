import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { Badge } from '../../../components/common/Badge';
import { EmptyState } from '../../../components/common/EmptyState';
import { Button } from '../../../components/common/Button';
import { RobotThumbnail } from '../../../components/dashboard/RobotThumbnail';
import { PROJECT_DEFINITIONS, physicalSummary, simulationSummary } from '../catalog/projects';
import { DEFAULT_FILTER, filterProjects, type LibraryFilter } from '../engine/library';
import { DifficultyBadge } from '../components/LibraryParts';

export default function LibraryPage() {
  const [filter, setFilter] = useState<LibraryFilter>(DEFAULT_FILTER);
  const shown = useMemo(() => filterProjects(PROJECT_DEFINITIONS, filter), [filter]);
  const select = 'h-8 rounded-md border border-line bg-panel px-2 text-xs outline-none focus:border-accent';

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <h1 className="text-xl font-semibold tracking-tight">Project Library</h1>
      <p className="mt-1 max-w-2xl text-[13px] text-muted">
        Six robotics projects built on AutoBotAI's own robot templates. Each one shows exactly what works in simulation and what exists for a physical build.
      </p>

      <div className="mt-5 flex flex-wrap items-end gap-2" role="search">
        <div className="relative min-w-[200px] flex-1">
          <label htmlFor="library-search" className="sr-only">
            Search projects
          </label>
          <Search size={13} className="pointer-events-none absolute top-2.5 left-2.5 text-faint" aria-hidden />
          <input
            id="library-search"
            value={filter.text}
            onChange={(e) => setFilter({ ...filter, text: e.target.value })}
            placeholder="Search: camera, arm, delivery…"
            className="h-8 w-full rounded-md border border-line bg-panel pr-2 pl-8 text-xs outline-none focus:border-accent"
            data-testid="library-search"
          />
        </div>
        <label className="flex flex-col gap-0.5 text-[10.5px] text-faint uppercase">
          Difficulty
          <select value={filter.difficulty} onChange={(e) => setFilter({ ...filter, difficulty: e.target.value as LibraryFilter['difficulty'] })} className={select} data-testid="library-difficulty">
            <option value="all">All levels</option>
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
        </label>
        <label className="flex flex-col gap-0.5 text-[10.5px] text-faint uppercase">
          Support
          <select value={filter.support} onChange={(e) => setFilter({ ...filter, support: e.target.value as LibraryFilter['support'] })} className={select} data-testid="library-support">
            <option value="all">Any support</option>
            <option value="simulation">Fully simulated</option>
            <option value="hardware">Has a physical build guide</option>
          </select>
        </label>
      </div>

      {shown.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={<Search size={18} />}
            title="No project matches"
            description="Try another word or clear the filters."
            action={
              <Button size="sm" onClick={() => setFilter(DEFAULT_FILTER)}>
                Clear filters
              </Button>
            }
          />
        </div>
      ) : (
        <ul className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="library-grid">
          {shown.map((d) => {
            const sim = simulationSummary(d);
            const phys = physicalSummary(d);
            return (
              <li key={d.id} className="overflow-hidden rounded-lg border border-line bg-panel transition-colors hover:border-[#3d4553]" data-testid="library-card" data-project={d.id}>
                <Link to={`/library/${d.slug}`} className="block" aria-label={`${d.name}: view details`}>
                  <div className="aspect-[16/7] border-b border-line-soft">
                    <RobotThumbnail category={d.category} templateId={d.templateId} />
                  </div>
                  <div className="space-y-2 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="text-[13px] font-semibold">{d.name}</h2>
                      <DifficultyBadge difficulty={d.difficulty} />
                    </div>
                    <p className="line-clamp-2 text-xs text-muted">{d.summary}</p>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge tone={sim.tone}>{sim.label}</Badge>
                      <Badge tone={phys.tone === 'neutral' ? 'neutral' : phys.tone}>{phys.tone === 'warn' ? 'Hardware: reference only' : phys.label}</Badge>
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
