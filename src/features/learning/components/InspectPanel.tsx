import { useEffect, useMemo, useRef, useState } from 'react';
import { Lock, ScanSearch } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { Badge } from '../../../components/common/Badge';
import { Button } from '../../../components/common/Button';
import { useSceneStore } from '../../../stores/sceneStore';
import { useViewportStore } from '../../../stores/viewportStore';
import { cn } from '../../../utils/cn';
import { useBlueprintStore } from '../../blueprint/blueprintStore';
import { programsForProject, useProgramStore } from '../../code-studio/storage/programStore';
import { setWorkspaceMode } from '../../controls/controlSession';
import { selectEngine } from '../../physics/simulation/simulationManager';
import { findProjectDefinition } from '../catalog/projects';
import { apiUsage, explainProgram } from '../engine/programExplain';
import { buildSequence, hierarchy, inspectComponent, relatedProgramLines } from '../engine/reverse';
import { useLearningSession } from '../store/learningSession';
import { useLearningStore } from '../store/learningStore';

const SEQUENCE = [
  'Understand the completed robot',
  'Explore overall behavior',
  'Inspect components',
  'Understand mechanical structure',
  'Understand joints',
  'Review electronics and wiring',
  'Understand the program',
  'Explore simulation',
  'Review the build sequence',
] as const;

export function InspectPanel({ projectId }: { projectId: string }) {
  const [stage, setStage] = useState(0);
  const model = useSceneStore(useShallow((s) => ({ objects: s.objects, joints: s.joints, actuators: s.actuators, controllers: s.controllers, sensors: s.sensors })));
  const projectName = useSceneStore((s) => s.projectName);
  const inspectedId = useLearningSession((s) => s.inspectedId);
  const inspect = useLearningSession((s) => s.inspect);
  const blueprint = useBlueprintStore((s) => (s.projectId === projectId ? s.blueprint : null));
  const origin = useLearningStore((s) => s.origins[projectId]);
  const def = origin ? findProjectDefinition(origin.definitionId) : undefined;
  const allPrograms = useProgramStore((s) => s.programs);
  const programs = useMemo(() => programsForProject(allPrograms, projectId), [allPrograms, projectId]);
  const [programId, setProgramId] = useState<string | null>(null);
  const program = programs.find((p) => p.id === programId) ?? programs[0];
  const [blocklyCode, setBlocklyCode] = useState<{ id: string; code: string | null } | null>(null);
  const insight = inspectedId ? inspectComponent(model, inspectedId, blueprint) : null;
  const tree = useMemo(() => hierarchy(model.objects), [model.objects]);
  const steps = useMemo(() => buildSequence(model), [model]);
  const listRef = useRef<HTMLDivElement>(null);

  // Block programs are explained through their generated JavaScript (loaded on demand).
  useEffect(() => {
    if (!program || program.language === 'javascript' || blocklyCode?.id === program.id) return;
    let alive = true;
    void import('../../code-studio/blockly/generator').then((m) => {
      const g = m.generateFromSource(program.source);
      if (alive) setBlocklyCode({ id: program.id, code: g.ok ? g.code : null });
    });
    return () => {
      alive = false;
    };
  }, [program, blocklyCode]);

  const code = program ? (program.language === 'javascript' ? program.source : blocklyCode?.id === program.id ? blocklyCode.code : null) : null;
  const explained = useMemo(() => (code ? explainProgram(code) : []), [code]);
  const related = useMemo(() => new Set(code && insight ? relatedProgramLines(code, insight) : []), [code, insight]);

  const pick = (id: string) => {
    inspect(id);
    useViewportStore.getState().requestFocus(id);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="inspect-panel">
      <div className="border-b border-line px-3 py-2">
        <div className="flex items-center gap-1.5 text-[13px] font-semibold">
          <ScanSearch size={14} className="text-accent" aria-hidden /> Reverse Engineering
        </div>
        <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted" data-testid="read-only-note">
          <Lock size={11} aria-hidden /> Read-only: clicking parts inspects them and never selects, moves or saves anything.
        </p>
        <ol className="mt-2 flex flex-wrap gap-1" aria-label="Reverse learning sequence">
          {SEQUENCE.map((title, i) => (
            <li key={title}>
              <button
                type="button"
                onClick={() => setStage(i)}
                aria-current={i === stage ? 'step' : undefined}
                title={title}
                aria-label={`${i + 1}. ${title}`}
                data-testid={`reverse-stage-${i + 1}`}
                className={cn('h-6 w-6 rounded border text-[10px]', i === stage ? 'border-accent bg-accent-soft text-ink' : 'border-line text-muted hover:text-ink')}
              >
                {i + 1}
              </button>
            </li>
          ))}
        </ol>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 text-[12.5px]">
        <h2 className="text-sm font-semibold" data-testid="reverse-stage-title">
          {stage + 1}. {SEQUENCE[stage]}
        </h2>

        {stage === 0 && (
          <div className="space-y-2 text-muted">
            <p>
              <span className="text-ink">{projectName}</span>
              {def ? ` is the ${def.name}. ${def.purpose}` : '.'}
            </p>
            <p data-testid="robot-counts">
              {model.objects.length} parts · {model.joints.length} joints · {model.actuators.length} actuators · {model.controllers.length} drive controllers · {model.sensors.length} sensors · {programs.length} programs
            </p>
            {def && <p>Real-world use: {def.realWorldUse}</p>}
          </div>
        )}

        {stage === 1 && (
          <div className="space-y-2 text-muted">
            {def ? (
              <ol className="list-decimal space-y-1 pl-4">
                {def.howItWorks.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ol>
            ) : (
              <p>This project was not made from the library, so there is no stored description of its behavior. Its program (step 7) shows what it does.</p>
            )}
            {code && <p>Its program calls: {apiUsage(code).join(', ') || 'no robot functions'}.</p>}
          </div>
        )}

        {(stage === 2 || stage === 3) && (
          <div className="space-y-2">
            <p className="text-[11px] text-muted">{stage === 2 ? 'Click a part here or in the 3D view.' : 'Each part is attached to the part above it; moving a parent moves its children.'}</p>
            <div ref={listRef} role="tree" aria-label="Component hierarchy" className="rounded-md border border-line-soft" data-testid="reverse-tree">
              {tree.map(({ object, depth }) => (
                <button
                  key={object.id}
                  type="button"
                  role="treeitem"
                  aria-selected={object.id === inspectedId}
                  onClick={() => pick(object.id)}
                  style={{ paddingLeft: 8 + depth * 14 }}
                  className={cn('flex h-7 w-full items-center gap-1.5 pr-2 text-left text-xs', object.id === inspectedId ? 'bg-accent-soft text-ink' : 'text-muted hover:bg-raised hover:text-ink')}
                  data-testid="reverse-tree-item"
                >
                  <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: object.color }} aria-hidden />
                  <span className="truncate">{object.name}</span>
                  <span className="ml-auto text-[10px] text-faint">{object.category}</span>
                </button>
              ))}
            </div>
            {insight ? (
              <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 rounded-md border border-line-soft p-2.5 text-xs" data-testid="component-insight" data-component={insight.object.name}>
                <dt className="text-faint">Name</dt>
                <dd className="text-ink">{insight.object.name}</dd>
                <dt className="text-faint">Category</dt>
                <dd className="text-muted">
                  {insight.category}
                  {insight.catalogName ? ` (${insight.catalogName})` : ''}
                </dd>
                <dt className="text-faint">Purpose</dt>
                <dd className="text-muted">{insight.purpose}</dd>
                <dt className="text-faint">Why needed</dt>
                <dd className="text-muted">{insight.whyNeeded}</dd>
                <dt className="text-faint">Parent</dt>
                <dd className="text-muted" data-testid="insight-parent">{insight.parent?.name ?? 'None (top-level part)'}</dd>
                <dt className="text-faint">Children</dt>
                <dd className="text-muted">{insight.children.map((c) => c.name).join(', ') || 'None'}</dd>
                <dt className="text-faint">Connected by joints</dt>
                <dd className="text-muted" data-testid="insight-connected">{insight.connected.map((c) => `${c.object.name} (${c.joint.name}, ${c.joint.type})`).join(', ') || 'None'}</dd>
                <dt className="text-faint">Sensors</dt>
                <dd className="text-muted">{insight.sensors.map((s) => `${s.name} (${s.id})`).join(', ') || 'None'}</dd>
                <dt className="text-faint">Actuators</dt>
                <dd className="text-muted">{insight.actuators.map((a) => `${a.name} (${a.controlMode})`).join(', ') || 'None'}</dd>
                <dt className="text-faint">Drive</dt>
                <dd className="text-muted">{insight.controllers.map((c) => c.name).join(', ') || 'None'}</dd>
                <dt className="text-faint">Program lines</dt>
                <dd className="text-muted">{related.size ? [...related].join(', ') : 'None found'}</dd>
                <dt className="text-faint">Real part</dt>
                <dd className="text-muted">{insight.realPart ? `${insight.realPart.name} (${insight.realPart.verification})` : 'Not mapped in the Robot Blueprint'}</dd>
              </dl>
            ) : (
              <p className="text-xs text-muted">No part selected for inspection yet.</p>
            )}
          </div>
        )}

        {stage === 4 && (
          <ul className="space-y-1.5 text-xs text-muted" data-testid="reverse-joints">
            {model.joints.length === 0 && <li>This robot has no joints.</li>}
            {model.joints.map((j) => {
              const parent = model.objects.find((o) => o.id === j.parentId);
              const child = model.objects.find((o) => o.id === j.childId);
              const actuator = model.actuators.find((a) => a.jointId === j.id);
              return (
                <li key={j.id} className="rounded-md border border-line-soft p-2">
                  <span className="text-ink">{j.name}</span> <Badge>{j.type}</Badge>
                  <div>
                    {parent?.name} → {child?.name}
                    {j.type !== 'fixed' && j.limits ? ` · limits ${j.limits.lower.toFixed(2)} … ${j.limits.upper.toFixed(2)}` : ''}
                  </div>
                  <div>{actuator ? `Driven by ${actuator.name} (${actuator.controlMode} control)` : j.type === 'fixed' ? 'Fixed: it does not move.' : 'No actuator: nothing drives this joint.'}</div>
                </li>
              );
            })}
          </ul>
        )}

        {stage === 5 && (
          <div className="space-y-2 text-xs text-muted">
            {blueprint && blueprint.mappings.length > 0 ? (
              <>
                <p>{blueprint.mappings.length} parts are mapped to real parts; {blueprint.wiring.length} wires are documented.</p>
                <ul className="list-disc space-y-0.5 pl-4">
                  {blueprint.mappings.map((m) => (
                    <li key={m.id}>
                      {m.snapshot.manufacturer} {m.snapshot.mpn} — {m.snapshot.name}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p>No real parts are mapped in this project's Robot Blueprint, so there is no electronics or wiring documentation to review.{def && def.parts.length > 0 ? ' The library lists the verified parts for this project on its detail page.' : ''}</p>
            )}
            <Button size="sm" onClick={() => setWorkspaceMode('blueprint')}>
              Open the Blueprint (changes are not saved while inspecting)
            </Button>
          </div>
        )}

        {stage === 6 && (
          <div className="space-y-2" data-testid="reverse-program">
            {programs.length === 0 ? (
              <p className="text-xs text-muted">This project has no program, so there is nothing to explain.</p>
            ) : (
              <>
                <label className="flex items-center gap-2 text-xs text-muted">
                  Program
                  <select value={program?.id} onChange={(e) => setProgramId(e.target.value)} className="h-7 rounded-md border border-line bg-app px-1.5 text-xs">
                    {programs.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.language === 'javascript' ? 'JavaScript' : 'Blocks'})
                      </option>
                    ))}
                  </select>
                </label>
                {program?.language === 'blockly' && <p className="text-[11px] text-faint">Block programs are explained through the JavaScript they generate.</p>}
                {code === null ? (
                  <p className="text-xs text-muted">Preparing…</p>
                ) : (
                  <ol className="space-y-1 font-mono text-[11px]">
                    {explained
                      .filter((l) => l.kind !== 'blank')
                      .map((l) => (
                        <li key={l.number} className={cn('rounded px-1.5 py-1', related.has(l.number) ? 'bg-[#A855F7]/15' : '')} data-testid="explained-line" data-related={related.has(l.number)}>
                          <div className="whitespace-pre-wrap text-ink">
                            <span className="mr-2 text-faint select-none">{l.number}</span>
                            {l.code.trim()}
                          </div>
                          {l.explanation && <div className="mt-0.5 font-sans text-[11px] text-muted">{l.explanation}</div>}
                        </li>
                      ))}
                  </ol>
                )}
                {insight && related.size > 0 && <p className="text-[11px] text-muted">Highlighted lines use {insight.object.name}.</p>}
              </>
            )}
          </div>
        )}

        {stage === 7 && (
          <div className="space-y-2 text-xs text-muted">
            <p>Run the program to see the behavior. Running does not change the saved project.</p>
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" onClick={() => setWorkspaceMode('code')}>
                Open Code Studio
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setWorkspaceMode('control');
                  void selectEngine('physics');
                }}
              >
                Simulate (Physics)
              </Button>
            </div>
            {def && <p>Expected: {def.expectedResult}</p>}
          </div>
        )}

        {stage === 8 && (
          <div className="space-y-2 text-xs text-muted">
            <p>Assembly order implied by how the parts are attached. It is derived from the model, not a verified physical procedure.</p>
            <ol className="list-decimal space-y-0.5 pl-5" data-testid="build-sequence">
              {steps.map((s) => (
                <li key={s.order}>{s.text}</li>
              ))}
            </ol>
            {def && def.parts.length > 0 && <p>For real parts, wiring and safety, read the Robot Blueprint's Build Guide.</p>}
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5 border-t border-line p-2">
        <Button size="sm" variant="ghost" disabled={stage === 0} onClick={() => setStage(stage - 1)} data-testid="reverse-prev">
          Back
        </Button>
        <Button size="sm" variant="primary" disabled={stage === SEQUENCE.length - 1} onClick={() => setStage(stage + 1)} data-testid="reverse-next">
          Next
        </Button>
        <span className="flex-1" />
        <Button size="sm" variant="ghost" onClick={() => useLearningSession.getState().setInspecting(false)} data-testid="exit-inspection">
          Exit inspection
        </Button>
      </div>
    </div>
  );
}
