import { useRobotStateStore } from '../../stores/robotStateStore';
import { useSceneStore } from '../../stores/sceneStore';
import { useSelectionStore } from '../../stores/selectionStore';
import { cn } from '../../utils/cn';

export function StatusBar() {
  const objects = useSceneStore((s) => s.objects);
  const dirty = useSceneStore((s) => s.dirty);
  const selectedId = useSelectionStore((s) => s.selectedId);
  const selected = objects.find((o) => o.id === selectedId);
  const mode = useRobotStateStore((s) => s.mode);
  const movement = useRobotStateStore((s) => s.movement.status);
  const speed = useRobotStateStore((s) => s.speedPercent);

  return (
    <footer className="flex h-6 shrink-0 items-center gap-4 border-t border-line bg-app px-3 text-[10.5px] text-muted" data-testid="status-bar">
      <span className="flex items-center gap-1.5">
        <span className={cn('h-1.5 w-1.5 rounded-full', mode === 'control' ? 'bg-accent' : 'bg-ok')} />
        <span data-testid="status-mode">{mode === 'control' ? 'Control Mode' : 'Build Mode'}</span>
      </span>
      {mode === 'control' && (
        <span data-testid="status-movement">
          Robot {movement} · speed {speed}%
        </span>
      )}
      <span>{objects.length} objects</span>
      <span className="truncate">Selected: {selected ? selected.name : 'none'}</span>
      <span className="ml-auto hidden items-center gap-1.5 md:flex">
        <span className="h-1.5 w-1.5 rounded-full bg-faint" /> {mode === 'control' ? 'Kinematic simulation (physics in Phase 5)' : 'Simulation: not connected (Phase 5)'}
      </span>
      <span className={cn(dirty ? 'text-warn' : 'text-muted')}>{dirty ? 'Draft: unsaved' : 'Draft: saved locally'}</span>
      <span className="hidden text-faint sm:inline">Phase 3</span>
    </footer>
  );
}
