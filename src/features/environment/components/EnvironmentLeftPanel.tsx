import { useState, type DragEvent, type ReactNode } from 'react';
import { Box, Copy, Cylinder, Eye, EyeOff, Lock, Mountain, Plus, Square, Trash2, Triangle, Unlock, Circle, LayoutPanelTop, Layers } from 'lucide-react';
import { Badge } from '../../../components/common/Badge';
import { Button } from '../../../components/common/Button';
import { Modal } from '../../../components/common/Modal';
import { Tabs } from '../../../components/common/Tabs';
import type { EnvironmentObjectKind, ObstacleShape } from '../../../types/environment';
import { cn } from '../../../utils/cn';
import { ENVIRONMENT_LIBRARY, KIND_LABEL, type LibraryItem } from '../config/environmentConfig';
import {
  addObject,
  createEnvironment,
  deleteEnvironment,
  duplicateEnvironment,
  duplicateObject,
  environmentList,
  openEnvironment,
  removeObject,
  renameObject,
  selectObject,
  updateObject,
  useEnvironmentStore,
} from '../store/environmentStore';

export const ENV_DRAG_TYPE = 'application/x-arai-environment-object';

const ICONS: Record<string, ReactNode> = {
  ground: <Layers size={14} />,
  wall: <Square size={14} />,
  box: <Box size={14} />,
  platform: <LayoutPanelTop size={14} />,
  ramp: <Triangle size={14} />,
  'obstacle-box': <Mountain size={14} />,
  'obstacle-cylinder': <Cylinder size={14} />,
  'obstacle-sphere': <Circle size={14} />,
};
const iconFor = (kind: EnvironmentObjectKind, shape?: ObstacleShape) => ICONS[kind === 'obstacle' ? `obstacle-${shape ?? 'box'}` : kind];
const itemKey = (i: LibraryItem) => (i.kind === 'obstacle' ? `obstacle-${i.shape}` : i.kind);

function Library() {
  const hasDraft = useEnvironmentStore((s) => s.draft !== null);
  const onDragStart = (event: DragEvent, item: LibraryItem) => {
    event.dataTransfer.setData(ENV_DRAG_TYPE, JSON.stringify({ kind: item.kind, shape: item.shape }));
    event.dataTransfer.effectAllowed = 'copy';
  };
  return (
    <div className="p-2" data-testid="environment-library">
      {!hasDraft && <p className="mb-2 text-[11px] text-warn">Create or open an environment first (Environments tab).</p>}
      <ul className="space-y-1">
        {ENVIRONMENT_LIBRARY.map((item) => (
          <li key={itemKey(item)}>
            <button
              type="button"
              draggable={hasDraft}
              onDragStart={(e) => onDragStart(e, item)}
              disabled={!hasDraft}
              onClick={() => addObject(item.kind, { shape: item.shape })}
              data-testid={`env-add-${itemKey(item)}`}
              className="flex w-full items-start gap-2 rounded-md border border-line-soft px-2 py-1.5 text-left hover:border-accent disabled:opacity-40"
              title={`${item.description} Click to add, or drag into the 3D view.`}
            >
              <span className="mt-0.5 text-muted">{iconFor(item.kind, item.shape)}</span>
              <span className="min-w-0">
                <span className="block text-[12px] font-medium text-ink">{item.label}</span>
                <span className="block text-[10.5px] text-faint">{item.description}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function NameEditor({ id, name, onDone }: { id: string; name: string; onDone: () => void }) {
  const [text, setText] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const commit = () => {
    if (text.trim() === name) return onDone();
    const result = renameObject(id, text);
    if (result.ok) onDone();
    else setError(result.errors.join(' '));
  };
  return (
    <span className="flex min-w-0 flex-1 flex-col">
      <input
        autoFocus
        className="h-6 rounded border border-accent bg-raised px-1 text-[11.5px] text-ink"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') onDone();
        }}
        data-testid={`env-rename-${id}`}
      />
      {error && <span className="text-[10px] text-err">{error}</span>}
    </span>
  );
}

function Hierarchy() {
  const objects = useEnvironmentStore((s) => s.draft?.objects ?? []);
  const selectedId = useEnvironmentStore((s) => s.selectedId);
  const [renaming, setRenaming] = useState<string | null>(null);
  if (objects.length === 0) return <p className="p-3 text-xs text-muted">No objects yet. Without a ground object the default floor is used. Add objects from the Library.</p>;
  return (
    <ul className="space-y-0.5 p-2" data-testid="environment-objects">
      {objects.map((o) => (
        <li
          key={o.id}
          className={cn('group flex items-center gap-1.5 rounded px-1.5 py-1 text-[11.5px]', o.id === selectedId ? 'bg-accent-soft' : 'hover:bg-raised')}
          data-testid={`env-object-${o.name}`}
        >
          <span className="text-muted">{iconFor(o.kind, o.shape)}</span>
          {renaming === o.id ? (
            <NameEditor id={o.id} name={o.name} onDone={() => setRenaming(null)} />
          ) : (
            <button type="button" className={cn('min-w-0 flex-1 truncate text-left', o.visible ? 'text-ink' : 'text-faint')} onClick={() => selectObject(o.id)} onDoubleClick={() => setRenaming(o.id)} title="Click to select, double-click to rename">
              {o.name}
            </button>
          )}
          <span className="hidden text-[10px] text-faint xl:inline">{KIND_LABEL[o.kind]}</span>
          <button type="button" aria-label={o.visible ? `Hide ${o.name}` : `Show ${o.name}`} onClick={() => updateObject(o.id, { visible: !o.visible }, `${o.visible ? 'Hide' : 'Show'} ${o.name}`)} className="text-faint hover:text-ink">
            {o.visible ? <Eye size={12} /> : <EyeOff size={12} />}
          </button>
          <button type="button" aria-label={o.locked ? `Unlock ${o.name}` : `Lock ${o.name}`} data-testid={`env-lock-${o.name}`} onClick={() => updateObject(o.id, { locked: !o.locked }, `${o.locked ? 'Unlock' : 'Lock'} ${o.name}`)} className={o.locked ? 'text-warn' : 'text-faint hover:text-ink'}>
            {o.locked ? <Lock size={12} /> : <Unlock size={12} />}
          </button>
          <button type="button" aria-label={`Duplicate ${o.name}`} onClick={() => duplicateObject(o.id)} className="text-faint hover:text-ink">
            <Copy size={12} />
          </button>
          <button type="button" aria-label={`Delete ${o.name}`} onClick={() => removeObject(o.id)} disabled={o.locked} className="text-faint hover:text-err disabled:opacity-30">
            <Trash2 size={12} />
          </button>
        </li>
      ))}
    </ul>
  );
}

function Environments() {
  const draftId = useEnvironmentStore((s) => s.draft?.id);
  useEnvironmentStore((s) => s.environments);
  const list = environmentList();
  const [toDelete, setToDelete] = useState<{ id: string; name: string } | null>(null);
  return (
    <div className="space-y-3 p-2" data-testid="environment-manager">
      <Button size="sm" variant="primary" className="w-full" icon={<Plus size={12} />} onClick={() => createEnvironment('floor')} data-testid="env-new-empty">
        New empty environment
      </Button>
      <section>
        <h4 className="mb-1 text-[10px] font-semibold tracking-wider text-faint uppercase">Templates (open as a copy)</h4>
        <ul className="space-y-1">
          {list
            .filter((e) => e.template)
            .map((e) => (
              <li key={e.id} className="flex items-center gap-2 text-[11.5px]">
                <span className="min-w-0 flex-1 truncate">{e.name}</span>
                <button type="button" className="text-accent hover:underline" onClick={() => createEnvironment(e.id)} data-testid={`env-template-${e.id}`}>
                  Use
                </button>
              </li>
            ))}
        </ul>
      </section>
      <section>
        <h4 className="mb-1 text-[10px] font-semibold tracking-wider text-faint uppercase">My environments</h4>
        {list.filter((e) => !e.template).length === 0 && <p className="text-[11px] text-faint">None saved yet.</p>}
        <ul className="space-y-1" data-testid="env-saved-list">
          {list
            .filter((e) => !e.template)
            .map((e) => (
              <li key={e.id} className={cn('flex items-center gap-1.5 rounded px-1 py-0.5 text-[11.5px]', e.id === draftId && 'bg-accent-soft')} data-testid={`env-saved-${e.name}`}>
                <span className="min-w-0 flex-1 truncate">{e.name}</span>
                {e.id === draftId && <Badge tone="accent">open</Badge>}
                <button type="button" className="text-accent hover:underline" onClick={() => openEnvironment(e.id)}>
                  Open
                </button>
                <button type="button" aria-label={`Duplicate ${e.name}`} onClick={() => duplicateEnvironment(e.id)} className="text-faint hover:text-ink">
                  <Copy size={12} />
                </button>
                <button type="button" aria-label={`Delete ${e.name}`} onClick={() => setToDelete(e)} className="text-faint hover:text-err" data-testid={`env-delete-${e.name}`}>
                  <Trash2 size={12} />
                </button>
              </li>
            ))}
        </ul>
      </section>
      <Modal
        open={toDelete !== null}
        title="Delete environment"
        onClose={() => setToDelete(null)}
        footer={
          <>
            <Button onClick={() => setToDelete(null)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => {
                if (toDelete) deleteEnvironment(toDelete.id);
                setToDelete(null);
              }}
              data-testid="env-confirm-delete"
            >
              Delete environment
            </Button>
          </>
        }
      >
        <p className="text-[13px] text-muted">
          Delete <span className="font-semibold text-ink">{toDelete?.name}</span> from this browser? Projects that use it fall back to the empty environment.
        </p>
      </Modal>
    </div>
  );
}

type EnvTab = 'library' | 'objects' | 'environments';

/** Left panel in the Environment Editor: object library, object hierarchy and the environment list. */
export function EnvironmentLeftPanel() {
  const count = useEnvironmentStore((s) => s.draft?.objects.length ?? 0);
  const hasDraft = useEnvironmentStore((s) => s.draft !== null);
  const [tab, setTab] = useState<EnvTab>(hasDraft ? 'library' : 'environments');
  const current = !hasDraft && tab !== 'environments' ? 'environments' : tab;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Tabs<EnvTab>
        ariaLabel="Environment panel"
        items={[
          { id: 'library', label: 'Library' },
          { id: 'objects', label: `Objects ${count}` },
          { id: 'environments', label: 'Environments' },
        ]}
        value={current}
        onChange={setTab}
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {current === 'library' && <Library />}
        {current === 'objects' && <Hierarchy />}
        {current === 'environments' && <Environments />}
      </div>
    </div>
  );
}
