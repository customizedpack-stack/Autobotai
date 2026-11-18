import { useMemo, useState, type ReactNode } from 'react';
import { Blocks, Braces, Copy, CopyPlus, Plus, Trash2 } from 'lucide-react';
import { Button, IconButton } from '../../../components/common/Button';
import { Modal } from '../../../components/common/Modal';
import { useSceneStore } from '../../../stores/sceneStore';
import { cn } from '../../../utils/cn';
import { checkDriveReady } from '../../controls/commands';
import { commandContext } from '../../controls/commandBus';
import { API_REFERENCE } from '../api/apiReference';
import { isProgramDirty, useCodeStudioStore } from '../codeStudioStore';
import { editors } from '../editorRegistry';
import { createProgram, deleteProgram, duplicateProgram, openProgram } from '../programActions';
import { isActiveState, useExecutionStore } from '../runtime/executionStore';
import { describeLimits } from '../runtime/executionLimits';
import { programsForProject, useProgramStore } from '../storage/programStore';
import type { RobotProgram } from '../storage/programTypes';

function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="border-b border-line-soft px-3 py-2.5">
      <div className="mb-1.5 flex items-center justify-between">
        <h3 className="text-[10.5px] font-semibold tracking-wider text-muted uppercase">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Insert text at the cursor of the open code editor (undoable). */
function insertAtCursor(text: string): boolean {
  const view = editors.code();
  if (!view) return false;
  const { from, to } = view.state.selection.main;
  view.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length } });
  view.focus();
  return true;
}

const plainSnippet = (snippet: string) => snippet.replace(/\$\{([^}]*)\}/g, '$1');

const DEG = 180 / Math.PI;

function ProgramRow({ program, active, running, onDelete }: { program: RobotProgram; active: boolean; running: boolean; onDelete: () => void }) {
  const dirty = useCodeStudioStore((s) => isProgramDirty(s, program.id));
  return (
    <li
      className={cn('group flex h-7 items-center gap-1.5 rounded-md pr-0.5 pl-1.5 text-xs', active ? 'bg-accent-soft text-ink' : 'text-muted hover:bg-raised hover:text-ink')}
      data-testid={`program-row-${program.name}`}
    >
      {program.language === 'blockly' ? <Blocks size={13} className="shrink-0 text-[#a78bfa]" /> : <Braces size={13} className="shrink-0 text-[#fbbf24]" />}
      <button type="button" className="min-w-0 flex-1 truncate text-left" onClick={() => openProgram(program.id)} disabled={running} title={running ? 'Stop the program to open another one' : `Open ${program.name}`}>
        {program.name}
      </button>
      {dirty && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-warn" title="Unsaved changes" />}
      <span className="flex opacity-0 group-focus-within:opacity-100 group-hover:opacity-100">
        <IconButton label={`Duplicate ${program.name}`} onClick={() => duplicateProgram(program.id)} disabled={running} className="h-6 w-6">
          <CopyPlus size={12} />
        </IconButton>
        <IconButton label={`Delete ${program.name}`} onClick={onDelete} disabled={running} className="h-6 w-6">
          <Trash2 size={12} />
        </IconButton>
      </span>
    </li>
  );
}

/** Left panel in Code Studio: programs, robot information, joints and the program API. */
export function CodeStudioSidePanel() {
  const projectId = useSceneStore((s) => s.projectId);
  const projectName = useSceneStore((s) => s.projectName);
  const objects = useSceneStore((s) => s.objects);
  const joints = useSceneStore((s) => s.joints);
  const actuators = useSceneStore((s) => s.actuators);
  const controllers = useSceneStore((s) => s.controllers);
  const allPrograms = useProgramStore((s) => s.programs);
  const activeId = useCodeStudioStore((s) => s.activeProgramId);
  const running = useExecutionStore((s) => isActiveState(s.state));
  const [pendingDelete, setPendingDelete] = useState<RobotProgram | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const programs = useMemo(() => (projectId ? programsForProject(allPrograms, projectId) : []), [allPrograms, projectId]);
  const active = programs.find((p) => p.id === activeId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const driveProblems = useMemo(() => checkDriveReady(commandContext()), [objects, joints, actuators, controllers]);
  const movable = joints.filter((j) => j.type !== 'fixed');
  const javascript = active?.language === 'javascript';

  return (
    <div className="min-h-0 flex-1 overflow-y-auto" data-testid="code-side-panel">
      <Section
        title={`Programs (${programs.length})`}
        action={
          <span className="flex gap-0.5">
            <IconButton label="New Blockly program" onClick={() => createProgram('blockly')} disabled={running} className="h-6 w-6" data-testid="new-blockly-program">
              <Plus size={12} />
            </IconButton>
            <IconButton label="New JavaScript program" onClick={() => createProgram('javascript')} disabled={running} className="h-6 w-6" data-testid="new-js-program">
              <Braces size={12} />
            </IconButton>
          </span>
        }
      >
        {programs.length === 0 ? (
          <p className="text-[11px] text-faint">No programs yet. Use + for blocks or {'{ }'} for JavaScript.</p>
        ) : (
          <ul className="space-y-0.5" data-testid="program-list">
            {programs.map((p) => (
              <ProgramRow key={p.id} program={p} active={p.id === activeId} running={running} onDelete={() => setPendingDelete(p)} />
            ))}
          </ul>
        )}
      </Section>

      <Section title="Robot">
        <p className="truncate text-[12.5px] font-semibold text-ink">{projectName}</p>
        {controllers.length === 0 ? (
          <p className="mt-1 text-[11px] text-faint">No drive controller: driving blocks will be refused. Joint blocks still work.</p>
        ) : driveProblems.length === 0 ? (
          <p className="mt-1 text-[11px] text-ok" data-testid="drive-ready">Drive ready (differential drive).</p>
        ) : (
          <ul className="mt-1 space-y-0.5 text-[11px] text-err" data-testid="drive-not-ready">
            {driveProblems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={`Joints (${movable.length})`}>
        {movable.length === 0 ? (
          <p className="text-[11px] text-faint">This robot has no movable joints.</p>
        ) : (
          <ul className="space-y-1" data-testid="code-joint-list">
            {movable.map((j) => {
              const actuator = actuators.find((a) => a.jointId === j.id);
              const unit = j.type === 'revolute' ? '°' : ' m';
              const fmt = (v: number) => (j.type === 'revolute' ? (v * DEG).toFixed(0) : v.toFixed(2));
              return (
                <li key={j.id} className="rounded-md border border-line-soft bg-app px-2 py-1">
                  <div className="flex items-center gap-1">
                    <span className="min-w-0 flex-1 truncate text-[11.5px] text-ink">{j.name}</span>
                    <IconButton
                      label={javascript ? `Insert the id of ${j.name}` : `Copy the id of ${j.name}`}
                      className="h-5 w-5"
                      onClick={() => {
                        const text = JSON.stringify(j.id);
                        if (!(javascript && insertAtCursor(text))) void navigator.clipboard?.writeText(j.id).catch(() => undefined);
                        setCopied(j.id);
                        setTimeout(() => setCopied(null), 1200);
                      }}
                    >
                      <Copy size={11} />
                    </IconButton>
                  </div>
                  <p className="font-mono text-[10px] text-faint">
                    {j.type} · {fmt(j.limits.lower)}{unit} … {fmt(j.limits.upper)}{unit} · {actuator ? (actuator.enabled ? actuator.type : 'motor disabled') : 'no actuator'}
                    {copied === j.id ? ' · copied' : ''}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title={javascript ? 'Robot API (click to insert)' : 'Robot API'}>
        <ul className="space-y-0.5" data-testid="api-list">
          {API_REFERENCE.map((entry) => (
            <li key={entry.name}>
              <button
                type="button"
                disabled={!javascript}
                onClick={() => insertAtCursor(plainSnippet(entry.snippet))}
                title={entry.description}
                className="w-full truncate rounded px-1 py-0.5 text-left font-mono text-[10.5px] text-[#93c5fd] enabled:hover:bg-raised disabled:cursor-default"
              >
                {entry.signature}
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-1.5 text-[10.5px] leading-relaxed text-faint">
          Programs run in a sandbox and control the robot only through this API. {describeLimits()}
        </p>
      </Section>

      <Modal
        open={pendingDelete !== null}
        title="Delete program"
        onClose={() => setPendingDelete(null)}
        footer={
          <>
            <Button onClick={() => setPendingDelete(null)}>Cancel</Button>
            <Button
              variant="danger"
              data-testid="confirm-delete-program"
              onClick={() => {
                if (pendingDelete) deleteProgram(pendingDelete.id);
                setPendingDelete(null);
              }}
            >
              Delete program
            </Button>
          </>
        }
      >
        <p className="text-[13px] text-muted">Delete “{pendingDelete?.name}”? This cannot be undone.</p>
      </Modal>
    </div>
  );
}
