import { useSceneStore } from '../../stores/sceneStore';
import { useSelectionStore } from '../../stores/selectionStore';
import { cn } from '../../utils/cn';

export function StatusBar() {
  const objects = useSceneStore((s) => s.objects);
  const dirty = useSceneStore((s) => s.dirty);
  const selectedId = useSelectionStore((s) => s.selectedId);
  const selected = objects.find((o) => o.id === selectedId);

  return (
    <footer className="flex h-6 shrink-0 items-center gap-4 border-t border-line bg-app px-3 text-[10.5px] text-muted" data-testid="status-bar">
      <span className="flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-ok" /> Editor ready
      </span>
      <span>{objects.length} objects</span>
      <span className="truncate">Selected: {selected ? selected.name : 'none'}</span>
      <span className="ml-auto hidden items-center gap-1.5 md:flex">
        <span className="h-1.5 w-1.5 rounded-full bg-faint" /> Simulation: not connected (Phase 5)
      </span>
      <span className={cn(dirty ? 'text-warn' : 'text-muted')}>{dirty ? 'Draft: unsaved' : 'Draft: saved locally'}</span>
      <span className="hidden text-faint sm:inline">Phase 2</span>
    </footer>
  );
}
