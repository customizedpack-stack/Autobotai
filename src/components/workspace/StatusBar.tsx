import { useBlueprintStore } from '../../features/blueprint/blueprintStore';
import { useSimulationStore } from '../../features/physics/simulation/simulationStore';
import { useRobotStateStore } from '../../stores/robotStateStore';
import { useSceneStore } from '../../stores/sceneStore';
import { useSelectionStore } from '../../stores/selectionStore';
import { cn } from '../../utils/cn';

const MODE_LABEL = { build: 'Build Mode', control: 'Control Mode', code: 'Code Studio', environment: 'Environment Editor', blueprint: 'Robot Blueprint' } as const;

export function StatusBar() {
  const objects = useSceneStore((s) => s.objects);
  const sceneDirty = useSceneStore((s) => s.dirty);
  const blueprintDirty = useBlueprintStore((s) => s.dirty);
  const dirty = sceneDirty || blueprintDirty;
  const selectedId = useSelectionStore((s) => s.selectedId);
  const selected = objects.find((o) => o.id === selectedId);
  const mode = useRobotStateStore((s) => s.mode);
  const movement = useRobotStateStore((s) => s.movement.status);
  const speed = useRobotStateStore((s) => s.speedPercent);
  const engine = useSimulationStore((s) => s.engine);
  const simState = useSimulationStore((s) => s.state);

  return (
    <footer className="flex h-6 shrink-0 items-center gap-4 border-t border-line bg-app px-3 text-[10.5px] text-muted" data-testid="status-bar">
      <span className="flex items-center gap-1.5">
        <span className={cn('h-1.5 w-1.5 rounded-full', mode === 'build' ? 'bg-ok' : 'bg-accent')} />
        <span data-testid="status-mode">{MODE_LABEL[mode]}</span>
      </span>
      {mode !== 'build' && mode !== 'blueprint' && (
        <span data-testid="status-movement">
          Robot {movement} · speed {speed}%
        </span>
      )}
      <span>{objects.length} objects</span>
      <span className="truncate">Selected: {selected ? selected.name : 'none'}</span>
      <span className="ml-auto hidden items-center gap-1.5 md:flex">
        <span className={cn('h-1.5 w-1.5 rounded-full', engine === 'physics' && simState === 'running' ? 'bg-ok' : 'bg-faint')} />
        <span data-testid="status-engine">{mode === 'build' ? 'Simulation: off in Build Mode' : mode === 'blueprint' ? 'Simulation: off in Robot Blueprint' : engine === 'physics' ? `Physics engine (Rapier) · ${simState}` : 'Kinematic engine'}</span>
      </span>
      <span className={cn(dirty ? 'text-warn' : 'text-muted')}>{dirty ? 'Draft: unsaved' : 'Draft: saved locally'}</span>
      <span className="hidden text-faint sm:inline">Phase 10</span>
    </footer>
  );
}
