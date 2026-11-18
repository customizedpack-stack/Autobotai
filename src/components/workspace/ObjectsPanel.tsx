import { Eye, EyeOff } from 'lucide-react';
import { COMPONENT_CATEGORIES } from '../../features/component-library/catalog';
import { useSceneStore } from '../../stores/sceneStore';
import { useSelectionStore } from '../../stores/selectionStore';
import { cn } from '../../utils/cn';

/** Scene outliner: every object in the open project. Hierarchy arrives in Phase 2. */
export function ObjectsPanel({ query }: { query: string }) {
  const objects = useSceneStore((s) => s.objects);
  const setVisible = useSceneStore((s) => s.setVisible);
  const selectedId = useSelectionStore((s) => s.selectedId);
  const select = useSelectionStore((s) => s.select);
  const q = query.trim().toLowerCase();
  const items = objects.filter((o) => !q || o.name.toLowerCase().includes(q) || o.category.includes(q));

  if (objects.length === 0) {
    return <p className="px-3 py-6 text-center text-xs text-muted">The scene is empty. Add a component to begin.</p>;
  }
  if (items.length === 0) {
    return <p className="px-3 py-6 text-center text-xs text-muted">No objects match “{query}”.</p>;
  }

  return (
    <ul className="p-1.5" data-testid="objects-panel" aria-label="Scene objects">
      {items.map((object) => {
        const active = object.id === selectedId;
        const label = COMPONENT_CATEGORIES.find((c) => c.id === object.category)?.label ?? object.category;
        return (
          <li key={object.id}>
            <div
              className={cn(
                'group flex h-7 items-center gap-2 rounded-md px-1.5 text-xs',
                active ? 'bg-accent-soft text-ink' : 'text-muted hover:bg-raised hover:text-ink',
              )}
            >
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
                onClick={() => select(object.id)}
                aria-current={active}
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: object.color }} />
                <span className={cn('truncate', !object.visible && 'line-through opacity-50')}>{object.name}</span>
                <span className="ml-auto shrink-0 text-[10px] text-faint">{label}</span>
              </button>
              <button
                type="button"
                onClick={() => setVisible(object.id, !object.visible)}
                aria-label={object.visible ? `Hide ${object.name}` : `Show ${object.name}`}
                title={object.visible ? 'Hide' : 'Show'}
                className="shrink-0 text-faint opacity-0 group-hover:opacity-100 hover:text-ink focus:opacity-100"
              >
                {object.visible ? <Eye size={13} /> : <EyeOff size={13} />}
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
