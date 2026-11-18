import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Blocks, Braces, FileCode2, Undo2, Wand2 } from 'lucide-react';
import { Button } from '../../../components/common/Button';
import { useSceneStore } from '../../../stores/sceneStore';
import { useWorkspaceStore } from '../../../stores/workspaceStore';
import { cn } from '../../../utils/cn';
import { log } from '../../../utils/logger';
import { isProgramDirty, useCodeStudioStore } from '../codeStudioStore';
import { formatCode } from '../editor/codeEditorSetup';
import { editors } from '../editorRegistry';
import { createProgram, ensureActiveProgram, revertProgram, saveActiveProgram } from '../programActions';
import { convertActiveToJavaScript, generateActiveBlockly, runActiveProgram } from '../runActions';
import { clearExecutionStatus } from '../runtime/executionManager';
import { useExecutionStore } from '../runtime/executionStore';
import { useProgramStore } from '../storage/programStore';
import { JAVASCRIPT_TEMPLATES } from '../storage/starterPrograms';
import type { RobotProgram } from '../storage/programTypes';
import { CodeStudioToolbar } from './CodeStudioToolbar';
import { JavaScriptEditor } from './JavaScriptEditor';
import type { GeneratedProgram } from '../blockly/generator';

// Blockly loads only when a block program is shown.
const BlocklyEditor = lazy(() => import('./BlocklyEditor').then((m) => ({ default: m.BlocklyEditor })));

/** Replace the code editor's text as one undoable edit (Ctrl+Z restores it). */
function replaceEditorText(text: string): void {
  const view = editors.code();
  if (!view) return;
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
  view.focus();
}

function JavaScriptTools({ program, onRevert }: { program: RobotProgram; onRevert: () => void }) {
  const dirty = useCodeStudioStore((s) => isProgramDirty(s, program.id));
  return (
    <>
      <label className="flex items-center gap-1.5 text-[11px] text-muted">
        <span className="hidden sm:inline">Template</span>
        <select
          value=""
          onChange={(e) => {
            const template = JAVASCRIPT_TEMPLATES.find((t) => t.id === e.target.value);
            if (template) replaceEditorText(template.source);
          }}
          aria-label="Load a starter template"
          title="Replace the code with a starter template (Ctrl+Z to undo)"
          data-testid="js-template"
          className="h-6 rounded border border-line bg-app px-1.5 text-[11px] text-ink outline-none focus:border-accent"
        >
          <option value="">Choose…</option>
          {JAVASCRIPT_TEMPLATES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <Button
        size="sm"
        variant="ghost"
        icon={<Wand2 size={13} />}
        title="Format the code (Prettier)"
        data-testid="format-code"
        onClick={async () => {
          const view = editors.code();
          if (!view) return;
          const result = await formatCode(view.state.doc.toString());
          if (result.ok) replaceEditorText(result.code);
          else log.warning('code', `Could not format: ${result.error}`);
        }}
      >
        Format
      </Button>
      <Button size="sm" variant="ghost" icon={<Undo2 size={13} />} disabled={!dirty} onClick={onRevert} title="Discard unsaved changes" data-testid="revert-program">
        Revert
      </Button>
    </>
  );
}

function GeneratedCode({ programId }: { programId: string }) {
  const draft = useCodeStudioStore((s) => s.drafts[programId]);
  const saved = useProgramStore((s) => s.programs[programId]?.source);
  const [generated, setGenerated] = useState<GeneratedProgram | null>(null);
  useEffect(() => {
    let current = true;
    void generateActiveBlockly().then((result) => current && setGenerated(result));
    return () => {
      current = false;
    };
  }, [draft, saved]);
  if (!generated) return <p className="p-3 text-xs text-muted">Generating code…</p>;
  const text = generated.ok ? generated.code : `// The blocks cannot be turned into code yet:\n${generated.issues.map((i) => `// - ${i.message}`).join('\n')}\n`;
  return <JavaScriptEditor initialDoc={text} readOnly testId="generated-code" />;
}

function ErrorBar({ program }: { program: RobotProgram }) {
  const state = useExecutionStore((s) => s.state);
  const error = useExecutionStore((s) => s.error);
  const programId = useExecutionStore((s) => s.programId);
  if (state !== 'error' || !error || programId !== program.id) return null;
  return (
    <div className="flex shrink-0 items-start gap-2 border-t border-err/40 bg-err/10 px-3 py-1.5 text-[11.5px] text-err" role="alert" data-testid="program-error">
      <AlertTriangle size={13} className="mt-0.5 shrink-0" />
      <span className="min-w-0 flex-1">
        {error.line ? <strong className="mr-1">Line {error.line}:</strong> : null}
        {error.message}
      </span>
      <button type="button" className="text-[11px] text-err/80 underline hover:text-err" onClick={clearExecutionStatus}>
        Dismiss
      </button>
    </div>
  );
}

/** Center pane of Code Studio: toolbar, editor (Blockly or JavaScript) and errors. Loaded only in Code Studio. */
export default function CodeStudioPane() {
  const projectId = useSceneStore((s) => s.projectId);
  const activeId = useCodeStudioStore((s) => s.activeProgramId);
  const program = useProgramStore((s) => (activeId ? s.programs[activeId] : undefined));
  const view = useCodeStudioStore((s) => s.view);
  const setView = useCodeStudioStore((s) => s.setView);
  const [editorKey, setEditorKey] = useState(0);
  const execution = useExecutionStore((s) => (s.programId === activeId ? s.error : null));

  useEffect(() => {
    if (projectId) ensureActiveProgram('blockly');
  }, [projectId]);

  // Code Studio layout: the program console is the bottom panel's main tab, and the
  // properties panel folds away to give the editor and viewport room (restored on leaving).
  useEffect(() => {
    const ws = useWorkspaceStore.getState();
    const rightWasOpen = !ws.collapsed.right;
    const previousTab = ws.bottomTab;
    ws.setBottomTab('program');
    ws.setPanelCollapsed('bottom', false);
    ws.setPanelCollapsed('right', true);
    return () => {
      const after = useWorkspaceStore.getState();
      if (rightWasOpen) after.setPanelCollapsed('right', false);
      if (after.bottomTab === 'program') after.setBottomTab(previousTab === 'program' ? 'console' : previousTab);
    };
  }, []);

  const onLoaded = useCallback(
    (serialized: string) => {
      if (!program) return;
      const store = useCodeStudioStore.getState();
      if (store.baselines[program.id] === undefined) store.setBaseline(program.id, serialized);
    },
    [program],
  );
  const onChange = useCallback(
    (source: string) => {
      if (!program) return;
      useCodeStudioStore.getState().setDraft(program.id, source);
    },
    [program],
  );

  useEffect(() => {
    if (program?.language !== 'javascript') return;
    const store = useCodeStudioStore.getState();
    if (store.baselines[program.id] === undefined) store.setBaseline(program.id, program.source);
  }, [program]);

  if (!program) {
    return (
      <section className="flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center gap-3 bg-panel p-6 text-center" data-testid="code-studio">
        <FileCode2 size={28} className="text-faint" />
        <p className="text-sm text-muted">Create a program to start coding your robot.</p>
        <div className="flex gap-2">
          <Button size="sm" variant="primary" icon={<Blocks size={13} />} onClick={() => createProgram('blockly')}>
            New Blockly program
          </Button>
          <Button size="sm" icon={<Braces size={13} />} onClick={() => createProgram('javascript')}>
            New JavaScript program
          </Button>
        </div>
      </section>
    );
  }

  const draft = useCodeStudioStore.getState().drafts[program.id];
  const initial = draft ?? program.source;
  const blockly = program.language === 'blockly';
  const errorLine = !blockly && execution?.line ? execution.line : null;

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-panel" data-testid="code-studio" data-language={program.language}>
      <CodeStudioToolbar program={program} />
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-line-soft bg-panel-2 px-2">
        {blockly ? (
          <>
            <div className="flex items-center rounded border border-line bg-app p-0.5" role="tablist" aria-label="Block program view">
              {(
                [
                  ['editor', 'Blocks'],
                  ['generated', 'JavaScript (read-only)'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={view === id}
                  onClick={() => setView(id)}
                  data-testid={`view-${id}`}
                  className={cn('h-5 rounded px-2 text-[11px] whitespace-nowrap', view === id ? 'bg-raised text-ink' : 'text-muted hover:text-ink')}
                >
                  {label}
                </button>
              ))}
            </div>
            <Button size="sm" variant="ghost" icon={<Braces size={13} />} onClick={() => void convertActiveToJavaScript()} title="Save the generated code as a new JavaScript program. The blocks are kept." data-testid="convert-to-js">
              Convert to JavaScript program
            </Button>
            <span className="ml-auto hidden truncate text-[10.5px] text-faint 2xl:inline">Only blocks under “when program starts” run.</span>
          </>
        ) : (
          <>
            <JavaScriptTools
              program={program}
              onRevert={() => {
                revertProgram(program.id);
                setEditorKey((k) => k + 1);
              }}
            />
            <span className="ml-auto hidden truncate text-[10.5px] text-faint 2xl:inline">Ctrl+Space autocomplete · Ctrl+F find · Ctrl+Enter run · Ctrl+S save</span>
          </>
        )}
      </div>
      <div className="relative min-h-0 flex-1" data-code-editor="area">
        {blockly ? (
          view === 'editor' ? (
            <Suspense fallback={<p className="p-3 text-xs text-muted" data-testid="blockly-loading">Loading blocks…</p>}>
              <BlocklyEditor key={`${program.id}:${editorKey}`} initialSource={initial} onLoaded={onLoaded} onChange={onChange} />
            </Suspense>
          ) : (
            <GeneratedCode programId={program.id} />
          )
        ) : (
          <JavaScriptEditor key={`${program.id}:${editorKey}`} initialDoc={initial} onChange={onChange} onSave={saveActiveProgram} onRun={() => void runActiveProgram()} errorLine={errorLine} />
        )}
      </div>
      <ErrorBar program={program} />
    </section>
  );
}
