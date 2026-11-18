import { useMemo, type ReactNode } from 'react';
import { REVISION } from 'three';
import { Badge } from '../../components/common/Badge';
import { FUTURE_CONNECTORS } from '../../core/bus/channels';
import { useSceneStore } from '../../stores/sceneStore';
import { useSimulationStore } from '../physics/simulation/simulationStore';
import { isStorageAvailable } from '../../utils/storage';

function webglVersion(): string {
  try {
    const canvas = document.createElement('canvas');
    if (canvas.getContext('webgl2')) return 'WebGL 2';
    if (canvas.getContext('webgl')) return 'WebGL 1';
  } catch {
    /* ignore */
  }
  return 'Unavailable';
}

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line-soft py-1 text-xs last:border-0">
      <span className="text-faint">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}

export function StatusView() {
  const objects = useSceneStore((s) => s.objects.length);
  const past = useSceneStore((s) => s.past.length);
  const future = useSceneStore((s) => s.future.length);
  const dirty = useSceneStore((s) => s.dirty);
  const engine = useSimulationStore((s) => s.engine);
  const simState = useSimulationStore((s) => s.state);
  const gl = useMemo(() => webglVersion(), []);
  const storage = useMemo(() => isStorageAvailable(), []);

  return (
    <div className="grid h-full grid-cols-1 gap-4 overflow-y-auto p-3 lg:grid-cols-3" data-testid="status-view">
      <div>
        <h4 className="mb-1.5 text-[10.5px] font-semibold tracking-wider text-muted uppercase">System</h4>
        <Item label="Renderer">
          {gl} · Three.js r{REVISION}
        </Item>
        <Item label="Browser storage">{storage ? <Badge tone="ok">Available</Badge> : <Badge tone="warn">Blocked</Badge>}</Item>
        <Item label="Scene objects">{objects}</Item>
        <Item label="Undo / redo steps">
          {past} / {future}
        </Item>
        <Item label="Draft">{dirty ? <Badge tone="warn">Unsaved</Badge> : <Badge tone="ok">Saved</Badge>}</Item>
      </div>
      <div>
        <h4 className="mb-1.5 text-[10.5px] font-semibold tracking-wider text-muted uppercase">Simulation</h4>
        <Item label="Physics engine">
          <Badge tone={simState === 'running' ? 'ok' : 'neutral'}>Rapier 0.21 · {simState}</Badge>
        </Item>
        <Item label="Selected engine">{engine === 'physics' ? 'Physics' : 'Kinematic'}</Item>
        <Item label="Timestep">1/60 s, 4 substeps</Item>
      </div>
      <div>
        <h4 className="mb-1.5 text-[10.5px] font-semibold tracking-wider text-muted uppercase">Connectors</h4>
        {FUTURE_CONNECTORS.map((c) => (
          <Item key={c.code} label={`${c.code} ${c.name}`}>
            <span className="text-[11px] text-faint">{c.phase}</span>
          </Item>
        ))}
      </div>
    </div>
  );
}
