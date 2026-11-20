import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Boxes, ExternalLink, GraduationCap, Play, ScanSearch } from 'lucide-react';
import { Button } from '../../../components/common/Button';
import { RobotThumbnail } from '../../../components/dashboard/RobotThumbnail';
import { findTemplate } from '../../robot-library/templates';
import { findProjectDefinition } from '../catalog/projects';
import { findTutorial } from '../catalog/tutorials';
import { CapabilityList, DifficultyBadge } from '../components/LibraryParts';
import { partName, verifiedBudget } from '../engine/budget';
import { LibraryDialogs } from '../components/LibraryDialogs';
import { useLibraryActions } from '../components/useLibraryActions';
import { STAGE_LABEL } from '../model/types';
import { NotFoundPage } from '../../../app/routes/NotFoundPage';

function Section({ title, children, id }: { title: string; children: ReactNode; id?: string }) {
  return (
    <section id={id} className="rounded-lg border border-line bg-panel p-4" aria-labelledby={`${id ?? title}-h`}>
      <h2 id={`${id ?? title}-h`} className="text-sm font-semibold">
        {title}
      </h2>
      <div className="mt-2 text-[13px] text-muted">{children}</div>
    </section>
  );
}

const SENSOR_LABEL = { distance: 'Distance sensor', encoder: 'Wheel encoders', imu: 'IMU', camera: 'Camera' } as const;

export default function ProjectDetailPage() {
  const { slug = '' } = useParams();
  const def = findProjectDefinition(slug);
  const actions = useLibraryActions();
  const [showComponents, setShowComponents] = useState(false);
  const componentsRef = useRef<HTMLDivElement>(null);
  const templateParts = useMemo(() => (def ? (findTemplate(def.templateId)?.build() ?? []) : []), [def]);
  if (!def) return <NotFoundPage message="This project is not in the library." />;
  const tutorial = findTutorial(def.tutorialId);
  const budget = verifiedBudget(def);

  const exploreComponents = () => {
    setShowComponents(true);
    requestAnimationFrame(() => componentsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8" data-testid="project-detail" data-project={def.id}>
      <Link to="/library" className="mb-4 inline-flex items-center gap-1.5 text-xs text-muted hover:text-ink">
        <ArrowLeft size={13} aria-hidden /> Project Library
      </Link>
      <div className="grid gap-5 md:grid-cols-[1fr_260px]">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">{def.name}</h1>
            <DifficultyBadge difficulty={def.difficulty} />
          </div>
          <p className="mt-1.5 text-[13px] text-muted">{def.summary}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="primary" icon={<GraduationCap size={14} />} onClick={() => actions.startTutorial(def)} data-testid="detail-start-tutorial">
              Start Guided Tutorial
            </Button>
            <Button icon={<ScanSearch size={14} />} onClick={() => void actions.exploreExample(def)} data-testid="detail-explore" title="Open a finished example robot in read-only Reverse Engineering inspection">
              Explore Project
            </Button>
            <Button icon={<Play size={14} />} onClick={() => actions.openRobot(def)} data-testid="detail-open-robot" title="Create a ready-to-run robot with its starter program">
              Open Robot
            </Button>
            <Button icon={<Boxes size={14} />} onClick={exploreComponents} data-testid="detail-components" aria-expanded={showComponents}>
              Explore Components
            </Button>
          </div>
        </div>
        <div className="aspect-[16/10] overflow-hidden rounded-lg border border-line md:aspect-auto md:h-40">
          <RobotThumbnail category={def.category} templateId={def.templateId} />
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Section title="Purpose">
          <p>{def.purpose}</p>
          <p className="mt-2">{def.description}</p>
        </Section>
        <Section title="Real-world use">
          <p>{def.realWorldUse}</p>
        </Section>
        <Section title="How it works">
          <ol className="list-decimal space-y-1 pl-5">
            {def.howItWorks.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </Section>
        <Section title="Learning objectives">
          <ul className="list-disc space-y-1 pl-5">
            {def.learningObjectives.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </Section>
        <Section title="Required sensors, actuators and controller">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
            <dt className="text-faint">Sensors</dt>
            <dd>{def.requiredSensors.length ? def.requiredSensors.map((s) => SENSOR_LABEL[s]).join(', ') : 'None'}</dd>
            <dt className="text-faint">Actuators</dt>
            <dd>{def.requiredActuators.join(', ')}</dd>
            <dt className="text-faint">Controller</dt>
            <dd>{def.requiredController}</dd>
            <dt className="text-faint">Template</dt>
            <dd>{findTemplate(def.templateId)?.name ?? def.templateId}</dd>
          </dl>
        </Section>
        <Section title="Required parts">
          <ul className="space-y-1">
            {def.requiredComponents.map((c) => (
              <li key={c.componentId}>
                <span className="text-ink">
                  {c.count} × {c.label}
                </span>{' '}
                — {c.role}
              </li>
            ))}
          </ul>
        </Section>
        <Section title="Simulation support">
          <CapabilityList items={def.simulationCapabilities} testId="sim-capabilities" />
        </Section>
        <Section title="Physical build support">
          <CapabilityList items={def.physicalRequirements} testId="phys-capabilities" />
          {def.parts.length > 0 && (
            <>
              <h3 className="mt-3 text-xs font-semibold text-ink">Verified real parts (Phase 9 catalog)</h3>
              <ul className="mt-1 space-y-1 text-xs">
                {def.parts.map((p) => {
                  const part = partName(p.partId);
                  return (
                    <li key={p.partId}>
                      {p.quantity} × {part.url ? (
                        <a href={part.url} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                          {part.name} <ExternalLink size={10} className="inline" aria-label="(opens the manufacturer page)" />
                        </a>
                      ) : (
                        part.name
                      )}{' '}
                      <span className="text-faint">({p.role}; {part.verification})</span>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-2 text-xs" data-testid="budget">
                {budget
                  ? `Verified list prices for ${budget.priced} of ${def.parts.length} parts: US$${budget.total.toFixed(2)}${budget.checkedAt ? ` (checked ${budget.checkedAt})` : ''}. No verified price for: ${budget.unpriced.join(', ') || 'none'}. Shipping, tax, battery, switch and wires are not included.`
                  : 'No verified prices are available, so no budget is shown.'}
              </p>
            </>
          )}
        </Section>
        <Section title="Expected result">
          <p>{def.expectedResult}</p>
        </Section>
        <Section title="Success criteria">
          <ul className="list-disc space-y-1 pl-5">
            {def.successCriteria.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
          {tutorial && <p className="mt-2 text-xs">Tutorial stages: {tutorial.steps.map((s) => STAGE_LABEL[s.stage]).join(' → ')}</p>}
        </Section>
      </div>

      <div ref={componentsRef} className="mt-4">
        {showComponents && (
          <Section title="Component explorer" id="components">
            <p className="text-xs">The parts of the {findTemplate(def.templateId)?.name} template this project is built from, with where each one is attached.</p>
            <ul className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2" data-testid="component-explorer">
              {templateParts.map((p) => (
                <li key={p.key ?? p.name} className="rounded-md border border-line-soft bg-app/50 p-2.5">
                  <div className="flex items-center gap-2 text-[13px] font-medium text-ink">
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ background: p.color }} aria-hidden />
                    {p.name}
                  </div>
                  <div className="text-xs">{p.description}</div>
                  <div className="text-[11px] text-faint">
                    {p.category}
                    {p.parentKey ? ` · attached to ${templateParts.find((x) => x.key === p.parentKey)?.name ?? p.parentKey}` : ' · top-level part'}
                  </div>
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>
      <LibraryDialogs actions={actions} />
    </div>
  );
}
