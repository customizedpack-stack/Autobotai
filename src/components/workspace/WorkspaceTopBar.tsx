import { useEffect, useState } from 'react';
import {
  ChevronLeft,
  Code2,
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
} from 'lucide-react';
import { redo, saveCurrentProject, undo } from '../../features/projects/workspaceActions';
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
  const dirty = useSceneStore((s) => s.dirty);
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
  { id: 'build', label: 'Build', icon: <Shapes size={13} />, phase: null },
  { id: 'code', label: 'Code', icon: <Code2 size={13} />, phase: 'Phase 4' },
  { id: 'simulate', label: 'Simulate', icon: <Play size={13} />, phase: 'Phase 5' },
] as const;

interface WorkspaceTopBarProps {
  onExit: () => void;
  onOpenSettings: () => void;
}

export function WorkspaceTopBar({ onExit, onOpenSettings }: WorkspaceTopBarProps) {
  const canUndo = useSceneStore((s) => s.past.length > 0);
  const canRedo = useSceneStore((s) => s.future.length > 0);
  const dirty = useSceneStore((s) => s.dirty);
  const projectName = useSceneStore((s) => s.projectName);
  const collapsed = useWorkspaceStore((s) => s.collapsed);
  const togglePanel = useWorkspaceStore((s) => s.togglePanel);

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

      <nav className="mx-auto hidden items-center rounded-md border border-line bg-app p-0.5 lg:flex" aria-label="Workspace mode">
        {MODES.map((mode) =>
          mode.phase ? (
            <span
              key={mode.id}
              className="flex h-6 cursor-not-allowed items-center gap-1.5 rounded px-2.5 text-xs text-faint"
              title={`${mode.label} mode arrives in ${mode.phase}`}
            >
              {mode.icon}
              {mode.label}
              <Lock size={10} />
            </span>
          ) : (
            <span key={mode.id} aria-current="page" className="flex h-6 items-center gap-1.5 rounded bg-raised px-2.5 text-xs font-medium text-ink">
              {mode.icon}
              {mode.label}
            </span>
          ),
        )}
      </nav>

      <div className="ml-auto flex items-center gap-0.5 lg:ml-0">
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
