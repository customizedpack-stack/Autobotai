import { useEffect, useState } from 'react';
import {
  ChevronLeft,
  Code2,
  Gamepad2,
  Lock,
  PanelBottom,
  PanelLeft,
  PanelRight,
  Play,
  Redo2,
  Save,
  Settings,
  Shapes,
  Undo2,
  Trees,
  ClipboardList,
} from 'lucide-react';
import { useBlueprintStore } from '../../features/blueprint/blueprintStore';
import { setWorkspaceMode } from '../../features/controls/controlSession';
import { useEnvironmentStore } from '../../features/environment/store/environmentStore';
import { selectEngine } from '../../features/physics/simulation/simulationManager';
import { useSimulationStore } from '../../features/physics/simulation/simulationStore';
import { redo, saveCurrentProject, undo } from '../../features/projects/workspaceActions';
import { useRobotStateStore, type WorkspaceMode } from '../../stores/robotStateStore';
import { useProjectStore } from '../../stores/projectStore';
import { useSceneStore } from '../../stores/sceneStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { cn } from '../../utils/cn';
import { formatRelativeTime } from '../../utils/format';
import { Button, IconButton } from '../common/Button';
import { LogoMark } from '../common/Logo';

function ProjectNameField({ name }: { name: string }) {
  const setProjectName = useSceneStore((s) => s.setProjectName);
  const [text, setText] = useState(name);
  return (
    <input
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => (text.trim() ? setProjectName(text) : setText(name))}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          setText(name);
          e.currentTarget.blur();
        }
      }}
      aria-label="Project name"
      data-testid="project-name"
      maxLength={60}
      className="h-7 w-28 min-w-0 rounded-md sm:w-48 border border-transparent bg-transparent px-2 text-[13px] font-semibold outline-none hover:border-line focus:border-accent focus:bg-app"
    />
  );
}

function SaveState() {
  const sceneDirty = useSceneStore((s) => s.dirty);
  const blueprintDirty = useBlueprintStore((s) => s.dirty);
  const dirty = sceneDirty || blueprintDirty;
  const projectId = useSceneStore((s) => s.projectId);
  const savedAt = useProjectStore((s) => (projectId ? s.projects[projectId]?.savedAt ?? null : null));
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => tick((n) => n + 1), 30000);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <span className="hidden items-center gap-1.5 text-[11px] whitespace-nowrap text-muted sm:flex" data-testid="save-state">
      <span className={cn('h-1.5 w-1.5 rounded-full', dirty ? 'bg-warn' : 'bg-ok')} />
      {dirty ? 'Unsaved changes' : `Saved ${formatRelativeTime(savedAt).toLowerCase()}`}
    </span>
  );
}

const MODES = [
  { id: 'build', label: 'Build', icon: <Shapes size={13} />, phase: null, hint: 'Edit the robot design (M)' },
  { id: 'control', label: 'Control', icon: <Gamepad2 size={13} />, phase: null, hint: 'Drive the robot with keys and buttons (M)' },
  { id: 'code', label: 'Code', icon: <Code2 size={13} />, phase: null, hint: 'Code Studio: program the robot with blocks or JavaScript' },
  { id: 'environment', label: 'Environment', icon: <Trees size={13} />, phase: null, hint: 'Environment Editor: build the world the robot is tested in' },
  { id: 'blueprint', label: 'Blueprint', icon: <ClipboardList size={13} />, phase: null, hint: 'Robot Blueprint: real parts, compatibility, wiring, BOM and build guide' },
  { id: 'simulate', label: 'Simulate', icon: <Play size={13} />, phase: null, hint: 'Physics simulation: opens Control Mode with the Physics engine' },
] as const;

interface WorkspaceTopBarProps {
  onExit: () => void;
  onOpenSettings: () => void;
}

export function WorkspaceTopBar({ onExit, onOpenSettings }: WorkspaceTopBarProps) {
  const mode = useRobotStateStore((s) => s.mode);
  const control = mode !== 'build';
  const envPast = useEnvironmentStore((s) => s.past.length);
  const envFuture = useEnvironmentStore((s) => s.future.length);
  const robotPast = useSceneStore((s) => s.past.length);
  const robotFuture = useSceneStore((s) => s.future.length);
  const bpPast = useBlueprintStore((s) => s.past.length);
  const bpFuture = useBlueprintStore((s) => s.future.length);
  // In the Environment Editor and the Robot Blueprint, Undo / Redo work on their own histories.
  const canUndo = mode === 'environment' ? envPast > 0 : mode === 'blueprint' ? bpPast > 0 : robotPast > 0 && !control;
  const canRedo = mode === 'environment' ? envFuture > 0 : mode === 'blueprint' ? bpFuture > 0 : robotFuture > 0 && !control;
  const sceneDirty = useSceneStore((s) => s.dirty);
  const blueprintDirty = useBlueprintStore((s) => s.dirty);
  const dirty = sceneDirty || blueprintDirty;
  const projectName = useSceneStore((s) => s.projectName);
  const collapsed = useWorkspaceStore((s) => s.collapsed);
  const togglePanel = useWorkspaceStore((s) => s.togglePanel);
  const physics = useSimulationStore((s) => s.engine === 'physics');
  const simulating = control && physics;
  const isActive = (id: string) => (id === 'simulate' ? simulating : id === 'control' ? mode === 'control' && !physics : mode === id);
  const choose = (id: string) => {
    if (id === 'simulate') {
      if (mode !== 'control' && mode !== 'code') setWorkspaceMode('control');
      void selectEngine('physics');
      return;
    }
    setWorkspaceMode(id as WorkspaceMode);
    if (id === 'control' && physics) void selectEngine('kinematic');
  };

  return (
    <header className="flex h-11 shrink-0 items-center gap-2 border-b border-line bg-panel px-2" data-testid="workspace-topbar">
      <button
        type="button"
        onClick={onExit}
        className="flex h-8 items-center gap-1.5 rounded-md pr-2 pl-1 text-muted hover:bg-raised hover:text-ink"
        aria-label="Back to dashboard"
        title="Back to dashboard"
      >
        <ChevronLeft size={15} />
        <LogoMark size={22} />
      </button>
      <div className="h-5 w-px bg-line" />
      <ProjectNameField key={projectName} name={projectName} />
      <SaveState />

      <nav className="mx-auto flex items-center rounded-md border border-line bg-app p-0.5" aria-label="Workspace mode">
        {MODES.map((m) =>
          m.phase ? (
            <span
              key={m.id}
              className="hidden h-6 cursor-not-allowed items-center gap-1.5 rounded px-2.5 text-xs text-faint lg:flex"
              title={`${m.label} mode arrives in ${m.phase}`}
            >
              {m.icon}
              {m.label}
              <Lock size={10} />
            </span>
          ) : (
            <button
              key={m.id}
              type="button"
              onClick={() => choose(m.id)}
              aria-pressed={isActive(m.id)}
              title={m.hint}
              data-testid={`mode-${m.id}`}
              aria-label={m.label}
              className={cn(
                'flex h-6 items-center gap-1.5 rounded px-2 text-xs font-medium whitespace-nowrap transition-colors lg:px-2.5',
                isActive(m.id) ? (m.id === 'build' ? 'bg-raised text-ink' : m.id === 'simulate' ? 'bg-ok text-white' : 'bg-accent text-white') : 'text-muted hover:text-ink',
              )}
            >
              {m.icon}
              <span className={isActive(m.id) ? 'inline' : 'hidden lg:inline'}>{m.label}</span>
            </button>
          ),
        )}
      </nav>

      <div className="flex items-center gap-0.5">
        <IconButton label="Undo" shortcut="Ctrl+Z" onClick={undo} disabled={!canUndo} data-testid="undo">
          <Undo2 size={15} />
        </IconButton>
        <IconButton label="Redo" shortcut="Ctrl+Shift+Z" onClick={redo} disabled={!canRedo} data-testid="redo">
          <Redo2 size={15} />
        </IconButton>
        <div className="mx-1 hidden h-5 w-px bg-line sm:block" />
        <div className="hidden items-center gap-0.5 sm:flex">
        <IconButton label="Toggle library panel" active={!collapsed.left} onClick={() => togglePanel('left')}>
          <PanelLeft size={15} />
        </IconButton>
        <IconButton label="Toggle console panel" active={!collapsed.bottom} onClick={() => togglePanel('bottom')}>
          <PanelBottom size={15} />
        </IconButton>
        <IconButton label="Toggle properties panel" active={!collapsed.right} onClick={() => togglePanel('right')}>
          <PanelRight size={15} />
        </IconButton>
        </div>
        <IconButton label="Settings" onClick={onOpenSettings}>
          <Settings size={15} />
        </IconButton>
        <div className="mx-1 h-5 w-px bg-line" />
        <Button
          size="sm"
          variant={dirty ? 'primary' : 'secondary'}
          icon={<Save size={13} />}
          onClick={() => saveCurrentProject()}
          title="Save local draft (Ctrl+S)"
          data-testid="save"
        >
          Save
        </Button>
      </div>
    </header>
  );
}
