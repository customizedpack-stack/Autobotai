import { useState } from 'react';
import { Blocks, Braces, Pause, Play, RotateCcw, Save, Square, StepForward } from 'lucide-react';
import { Button } from '../../../components/common/Button';
import { cn } from '../../../utils/cn';
import { isProgramDirty, useCodeStudioStore } from '../codeStudioStore';
import { renameProgram, saveActiveProgram, switchLanguage } from '../programActions';
import { runActiveProgram } from '../runActions';
import { pauseProgram, resetRobotFromCodeStudio, resumeProgram, stopProgram } from '../runtime/executionManager';
import { isActiveState, useExecutionStore } from '../runtime/executionStore';
import type { RobotProgram } from '../storage/programTypes';
import { ExecutionStatus } from './ExecutionStatus';
import { ExecutionTargetSelect } from '../../hardware/components/ExecutionTargetSelect';

function ProgramName({ program }: { program: RobotProgram }) {
  const [value, setValue] = useState(program.name);
  const commit = () => {
    if (value.trim() === program.name) return;
    if (!renameProgram(program.id, value)) setValue(program.name);
  };
  return (
    <input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          setValue(program.name);
          e.currentTarget.blur();
        }
      }}
      aria-label="Program name"
      title="Program name (click to rename)"
      data-testid="program-name"
      maxLength={60}
      className="h-7 w-40 min-w-0 rounded-md border border-transparent bg-transparent px-1.5 text-[13px] font-semibold text-ink outline-none hover:border-line focus:border-accent focus:bg-app xl:w-52"
    />
  );
}

/** Code Studio toolbar: editor type, program name, Run / Pause / Resume / Stop / Reset / Save, status. */
export function CodeStudioToolbar({ program }: { program: RobotProgram }) {
  const state = useExecutionStore((s) => s.state);
  const dirty = useCodeStudioStore((s) => isProgramDirty(s, program.id));
  const active = isActiveState(state);

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-line bg-panel px-2 py-1.5" data-testid="code-toolbar">
      <div className="flex items-center rounded-md border border-line bg-app p-0.5" role="radiogroup" aria-label="Programming language">
        {(
          [
            { id: 'blockly', label: 'Blockly', icon: <Blocks size={13} />, hint: 'Visual programming with blocks' },
            { id: 'javascript', label: 'JavaScript', icon: <Braces size={13} />, hint: 'Write JavaScript in the code editor' },
          ] as const
        ).map((lang) => (
          <button
            key={lang.id}
            type="button"
            role="radio"
            aria-checked={program.language === lang.id}
            disabled={active}
            onClick={() => switchLanguage(lang.id)}
            title={active ? 'Stop the program to switch' : lang.hint}
            data-testid={`lang-${lang.id}`}
            className={cn(
              'flex h-6 items-center gap-1.5 rounded px-2.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
              program.language === lang.id ? 'bg-accent text-white' : 'text-muted hover:text-ink',
            )}
          >
            {lang.icon}
            {lang.label}
          </button>
        ))}
      </div>

      <div className="flex min-w-0 items-center gap-1">
        <ProgramName key={program.id + program.name} program={program} />
        {dirty && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-warn" title="Unsaved changes" data-testid="program-dirty" />}
      </div>

      <div className="ml-auto flex flex-wrap items-center gap-1">
        <ExecutionTargetSelect disabled={active} />
        <ExecutionStatus />
        <span className="mx-1 h-5 w-px bg-line" />
        <Button size="sm" variant="primary" icon={<Play size={13} />} onClick={() => void runActiveProgram()} disabled={active} data-testid="run-program" title="Run the program (Ctrl+Enter in the code editor)">
          Run
        </Button>
        <Button size="sm" icon={<Pause size={13} />} onClick={pauseProgram} disabled={state !== 'running'} data-testid="pause-program" aria-label="Pause" title="Pause: the robot stops and the program waits at its next robot command or loop step">
          <span className="hidden 2xl:inline">Pause</span>
        </Button>
        <Button size="sm" icon={<StepForward size={13} />} onClick={resumeProgram} disabled={state !== 'paused'} data-testid="resume-program" aria-label="Resume" title="Resume from the same point">
          <span className="hidden 2xl:inline">Resume</span>
        </Button>
        <Button size="sm" variant="danger" icon={<Square size={12} />} onClick={() => stopProgram()} data-testid="stop-program" title="Stop the program and the robot immediately (always available)">
          Stop
        </Button>
        <Button size="sm" icon={<RotateCcw size={13} />} onClick={resetRobotFromCodeStudio} data-testid="reset-robot" aria-label="Reset Robot" title="Return the robot to its design pose (stops a running program first)">
          <span className="hidden 2xl:inline">Reset Robot</span>
        </Button>
        <Button size="sm" icon={<Save size={13} />} onClick={saveActiveProgram} disabled={!dirty} data-testid="save-program" aria-label="Save" title="Save the program (Ctrl+S)">
          <span className="hidden 2xl:inline">Save</span>
        </Button>
      </div>
    </div>
  );
}
