import { useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertTriangle, GraduationCap, Pencil, Play, ScanSearch, Wand2 } from 'lucide-react';
import { Badge } from '../../../components/common/Badge';
import { Button } from '../../../components/common/Button';
import { simulationSummary, physicalSummary } from '../catalog/projects';
import { findTutorial } from '../catalog/tutorials';
import { DifficultyBadge } from '../components/LibraryParts';
import { verifiedBudget } from '../engine/budget';
import { LibraryDialogs } from '../components/LibraryDialogs';
import { useLibraryActions, type LibraryActions } from '../components/useLibraryActions';
import { matchPurpose, type DetectChoice, type Match, type PurposeAnswers, type WhereChoice } from '../engine/purposeMatcher';
import type { Difficulty } from '../model/types';

const DETECT: { id: DetectChoice; label: string }[] = [
  { id: 'obstacles', label: 'Obstacles in its way' },
  { id: 'line', label: 'A line on the floor' },
  { id: 'objects-to-move', label: 'Objects to pick up and move' },
  { id: 'images', label: 'What it sees (pictures)' },
  { id: 'distance-travelled', label: 'How far it has gone' },
  { id: 'soil', label: 'Soil or plant conditions' },
  { id: 'people', label: 'People' },
];
const WHERE: { id: WhereChoice; label: string }[] = [
  { id: 'indoor', label: 'Indoors (home, school, office)' },
  { id: 'warehouse', label: 'Warehouse or factory' },
  { id: 'outdoor', label: 'Outdoors' },
  { id: 'garden', label: 'Garden or farm' },
  { id: 'table', label: 'On a table or workbench' },
];

function ResultCard({ match, best, actions }: { match: Match; best: boolean; actions: LibraryActions }) {
  const { def } = match;
  const sim = simulationSummary(def);
  const phys = physicalSummary(def);
  const budget = verifiedBudget(def);
  return (
    <article className={best ? 'rounded-lg border border-accent bg-panel p-4' : 'rounded-lg border border-line bg-panel p-4'} data-testid={best ? 'purpose-best' : 'purpose-alternative'} data-project={def.id}>
      <div className="flex flex-wrap items-center gap-2">
        {best && <Badge tone="accent">Best match</Badge>}
        <h3 className="text-sm font-semibold">{def.name}</h3>
        <DifficultyBadge difficulty={def.difficulty} />
      </div>
      <p className="mt-1 text-xs text-muted">{def.summary}</p>
      <h4 className="mt-3 text-[11px] font-semibold text-faint uppercase">Why it matches</h4>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-muted" data-testid="purpose-reasons">
        {match.reasons.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-faint">Components</dt>
        <dd className="text-muted">{def.requiredComponents.map((c) => `${c.count} × ${c.label}`).join(', ')}</dd>
        <dt className="text-faint">Simulation</dt>
        <dd className="text-muted">
          {sim.label}: {def.simulationCapabilities.map((c) => `${c.label} (${c.status.replace(/-/g, ' ')})`).join(', ')}
        </dd>
        <dt className="text-faint">Physical</dt>
        <dd className="text-muted">{phys.label}</dd>
        {budget && (
          <>
            <dt className="text-faint">Budget</dt>
            <dd className="text-muted">
              US${budget.total.toFixed(2)} in verified list prices for {budget.priced} of {def.parts.length} parts (others have no verified price)
            </dd>
          </>
        )}
        <dt className="text-faint">Tutorial</dt>
        <dd className="text-muted">{findTutorial(def.tutorialId)?.title}</dd>
      </dl>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link to={`/library/${def.slug}`} className="inline-flex h-7 items-center gap-1.5 rounded-md border border-line bg-raised px-2.5 text-xs font-medium hover:bg-[#2c333e]" data-testid="purpose-explore">
          <ScanSearch size={13} aria-hidden /> Explore Project
        </Link>
        <Button size="sm" variant={best ? 'primary' : 'secondary'} icon={<GraduationCap size={13} />} onClick={() => actions.startTutorial(def)} data-testid="purpose-tutorial">
          Start Tutorial
        </Button>
        <Button size="sm" icon={<Play size={13} />} onClick={() => actions.openRobot(def)} data-testid="purpose-open">
          Open Robot
        </Button>
      </div>
    </article>
  );
}

export default function PurposeBuilderPage() {
  const [params] = useSearchParams();
  const actions = useLibraryActions();
  const initial = params.get('goal') ?? '';
  const [text, setText] = useState(initial);
  const [where, setWhere] = useState<WhereChoice | null>(null);
  const [detect, setDetect] = useState<DetectChoice[]>([]);
  const [experience, setExperience] = useState<Difficulty | null>(null);
  const [budget, setBudget] = useState<'lowest' | 'any' | null>(null);
  const [submitted, setSubmitted] = useState<PurposeAnswers | null>(initial ? { text: initial } : null);
  const result = useMemo(() => (submitted ? matchPurpose(submitted) : null), [submitted]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted({ text, where, detect, experience, budget });
  };
  const toggle = (d: DetectChoice) => setDetect((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]));
  const field = 'h-8 w-full rounded-md border border-line bg-app px-2 text-xs outline-none focus:border-accent';

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
        <Wand2 size={18} className="text-accent" aria-hidden /> Robot Builder
      </h1>
      <p className="mt-1 max-w-2xl text-[13px] text-muted">
        Describe your idea and answer a few short questions. AutoBotAI matches it to the projects it can really build and simulate, and says clearly what it cannot do yet. Prefer to pick a template yourself?{' '}
        <Link to="/new" className="text-accent hover:underline">
          Create a robot from a template
        </Link>
        .
      </p>

      <form onSubmit={submit} className="mt-5 space-y-4 rounded-lg border border-line bg-panel p-4" data-testid="purpose-form">
        <div>
          <label htmlFor="purpose-text" className="text-[13px] font-semibold">
            What do you want your robot to do?
          </label>
          <textarea
            id="purpose-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            maxLength={400}
            placeholder="I want a robot that can move around my garden and monitor soil conditions."
            className="mt-1.5 w-full rounded-md border border-line bg-app px-3 py-2 text-[13px] outline-none focus:border-accent"
            data-testid="purpose-text"
          />
        </div>
        <fieldset>
          <legend className="text-xs font-semibold text-muted">What must it detect? (optional, choose any)</legend>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {DETECT.map((d) => (
              <button
                key={d.id}
                type="button"
                aria-pressed={detect.includes(d.id)}
                onClick={() => toggle(d.id)}
                data-testid={`detect-${d.id}`}
                className={detect.includes(d.id) ? 'h-7 rounded-md border border-accent bg-accent-soft px-2.5 text-xs text-ink' : 'h-7 rounded-md border border-line px-2.5 text-xs text-muted hover:text-ink'}
              >
                {d.label}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="text-xs font-semibold text-muted">
            Where will it operate?
            <select value={where ?? ''} onChange={(e) => setWhere((e.target.value || null) as WhereChoice | null)} className={`${field} mt-1`} data-testid="purpose-where">
              <option value="">Not sure</option>
              {WHERE.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-muted">
            Your experience
            <select value={experience ?? ''} onChange={(e) => setExperience((e.target.value || null) as Difficulty | null)} className={`${field} mt-1`} data-testid="purpose-experience">
              <option value="">Not sure</option>
              <option value="beginner">Beginner</option>
              <option value="intermediate">Some experience</option>
              <option value="advanced">Advanced</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-muted">
            Budget preference
            <select value={budget ?? ''} onChange={(e) => setBudget((e.target.value || null) as 'lowest' | 'any' | null)} className={`${field} mt-1`} data-testid="purpose-budget">
              <option value="">No preference</option>
              <option value="lowest">As low as possible</option>
              <option value="any">Not important</option>
            </select>
          </label>
        </div>
        <Button type="submit" variant="primary" icon={<Wand2 size={14} />} data-testid="purpose-submit">
          Find matching projects
        </Button>
      </form>

      {result && (
        <section className="mt-6 space-y-4" aria-live="polite" aria-labelledby="results-h" data-testid="purpose-results">
          <div className="flex items-center justify-between">
            <h2 id="results-h" className="text-sm font-semibold">
              Recommendations
            </h2>
            <Button size="sm" variant="ghost" icon={<Pencil size={13} />} onClick={() => document.getElementById('purpose-text')?.focus()} data-testid="purpose-modify">
              Modify My Idea
            </Button>
          </div>
          {result.unsupported.length > 0 && (
            <div className="rounded-lg border border-warn/40 bg-warn/10 p-4 text-xs" role="note" data-testid="purpose-unsupported">
              <p className="flex items-center gap-1.5 font-semibold text-warn">
                <AlertTriangle size={14} aria-hidden /> {result.goalUnsupported ? 'Part of your idea cannot be built or simulated in AutoBotAI yet' : 'Limits to know about'}
              </p>
              <ul className="mt-1.5 list-disc space-y-1 pl-5 text-muted">
                {result.unsupported.map((u) => (
                  <li key={u.id}>
                    <span className="text-ink">{u.what}:</span> {u.missing}
                  </li>
                ))}
              </ul>
              {result.goalUnsupported && <p className="mt-1.5 text-muted">The project below is the closest one that works today. It does not do everything you described.</p>}
            </div>
          )}
          {result.best ? (
            <>
              <ResultCard match={result.best} best actions={actions} />
              {result.alternatives.length > 0 && (
                <>
                  <h3 className="text-xs font-semibold text-muted uppercase">Alternatives</h3>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {result.alternatives.map((m) => (
                      <ResultCard key={m.def.id} match={m} best={false} actions={actions} />
                    ))}
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="rounded-lg border border-line bg-panel p-4 text-xs text-muted" data-testid="purpose-none">
              No project matches yet. Describe the task in more words (what it should do, where, what it must notice), or{' '}
              <Link to="/library" className="text-accent hover:underline">
                browse all six projects
              </Link>
              .
            </div>
          )}
        </section>
      )}
      <LibraryDialogs actions={actions} />
    </div>
  );
}
