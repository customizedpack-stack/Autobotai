import { useMemo, useState, type DragEvent } from 'react';
import { Bot, ChevronDown, ChevronRight, CornerLeftUp, Eye, EyeOff, Link2 } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { COMPONENT_CATEGORIES } from '../../features/component-library/catalog';
import { childrenMap } from '../../features/robot-model/hierarchy';
import { jointTypeLabel } from '../../features/robot-model/joints';
import { robotModel } from '../../features/robot-model/robotModelConnector';
import { JOINT_COLORS } from '../../features/viewport/jointStyle';
import { useRobotStateStore } from '../../stores/robotStateStore';
import { useSceneStore } from '../../stores/sceneStore';
import { useSelectionStore } from '../../stores/selectionStore';
import type { RobotJoint } from '../../types/joint';
import type { SceneObject } from '../../types/scene';
import { cn } from '../../utils/cn';

const TREE_DRAG_TYPE = 'application/x-arai-tree-node';

interface RowProps {
  object: SceneObject;
  depth: number;
  childCount: number;
  expanded: boolean;
  joint: RobotJoint | undefined;
  onToggle: (id: string) => void;
}

function TreeRow({ object, depth, childCount, expanded, joint, onToggle }: RowProps) {
  const selectedId = useSelectionStore((s) => s.selectedId);
  const selectedJointId = useSelectionStore((s) => s.selectedJointId);
  const select = useSelectionStore((s) => s.select);
  const selectJoint = useSelectionStore((s) => s.selectJoint);
  const setVisible = useSceneStore((s) => s.setVisible);
  const [dropHover, setDropHover] = useState(false);
  const control = useRobotStateStore((s) => s.mode !== 'build');
  const active = object.id === selectedId;
  const label = COMPONENT_CATEGORIES.find((c) => c.id === object.category)?.label ?? object.category;

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDropHover(false);
    const dragged = event.dataTransfer.getData(TREE_DRAG_TYPE);
    if (dragged && dragged !== object.id) robotModel.reparent(dragged, object.id);
  };

  return (
    <li role="treeitem" aria-expanded={childCount ? expanded : undefined} aria-selected={active} aria-level={depth + 1}>
      <div
        draggable={!control}
        onDragStart={(event) => {
          event.dataTransfer.setData(TREE_DRAG_TYPE, object.id);
          event.dataTransfer.effectAllowed = 'move';
        }}
        onDragOver={(event) => {
          if (control || !event.dataTransfer.types.includes(TREE_DRAG_TYPE)) return;
          event.preventDefault();
          setDropHover(true);
        }}
        onDragLeave={() => setDropHover(false)}
        onDrop={onDrop}
        data-testid={`tree-row-${object.name}`}
        className={cn(
          'group flex h-7 items-center gap-1 rounded-md pr-1.5 text-xs',
          active ? 'bg-accent-soft text-ink' : 'text-muted hover:bg-raised hover:text-ink',
          dropHover && 'ring-1 ring-warn',
        )}
        style={{ paddingLeft: 4 + depth * 14 }}
      >
        <button
          type="button"
          onClick={() => onToggle(object.id)}
          aria-label={expanded ? `Collapse ${object.name}` : `Expand ${object.name}`}
          className={cn('flex h-4 w-4 shrink-0 items-center justify-center text-faint hover:text-ink', !childCount && 'invisible')}
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
        <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => select(object.id)} aria-current={active}>
          <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: object.color }} />
          <span className={cn('truncate', !object.visible && 'line-through opacity-50')}>{object.name}</span>
        </button>
        {joint && (
          <button
            type="button"
            onClick={() => selectJoint(joint.id)}
            title={`${jointTypeLabel(joint.type)} joint: ${joint.name}`}
            aria-label={`Select joint ${joint.name}`}
            className={cn(
              'flex h-4 shrink-0 items-center gap-0.5 rounded px-1 text-[9.5px] font-medium uppercase',
              selectedJointId === joint.id ? 'bg-accent text-white' : 'bg-raised',
            )}
            style={selectedJointId === joint.id ? undefined : { color: JOINT_COLORS[joint.type] }}
          >
            <Link2 size={9} />
            {joint.type.slice(0, 3)}
          </button>
        )}
        {!joint && <span className="max-w-16 shrink-0 truncate text-[10px] text-faint group-hover:hidden">{label}</span>}
        <button
          type="button"
          disabled={control}
          onClick={() => setVisible(object.id, !object.visible)}
          aria-label={object.visible ? `Hide ${object.name}` : `Show ${object.name}`}
          title={object.visible ? 'Hide' : 'Show'}
          className="hidden shrink-0 text-faint group-hover:block hover:text-ink"
        >
          {object.visible ? <Eye size={13} /> : <EyeOff size={13} />}
        </button>
      </div>
    </li>
  );
}

/**
 * Scene outliner as a component tree. Drag a row onto another row to attach
 * it (world position is kept); drop it on "Robot" to detach it to the root.
 */
export function ObjectsPanel({ query }: { query: string }) {
  const { objects, joints, projectName } = useSceneStore(useShallow((s) => ({ objects: s.objects, joints: s.joints, projectName: s.projectName })));
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [rootHover, setRootHover] = useState(false);
  const q = query.trim().toLowerCase();

  const children = useMemo(() => childrenMap(objects), [objects]);
  const byId = useMemo(() => new Map(objects.map((o) => [o.id, o])), [objects]);
  const jointByChild = useMemo(() => new Map(joints.map((j) => [j.childId, j])), [joints]);

  const toggle = (id: string) =>
    setCollapsed((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (objects.length === 0) {
    return <p className="px-3 py-6 text-center text-xs text-muted">The scene is empty. Add or drag a component to begin.</p>;
  }

  const rows: RowProps[] = [];
  if (q) {
    // Search shows a flat list of matches.
    for (const o of objects) {
      if (o.name.toLowerCase().includes(q) || o.category.includes(q)) {
        rows.push({ object: o, depth: 0, childCount: 0, expanded: false, joint: jointByChild.get(o.id), onToggle: toggle });
      }
    }
    if (rows.length === 0) return <p className="px-3 py-6 text-center text-xs text-muted">No objects match “{query}”.</p>;
  } else {
    const visit = (id: string, depth: number) => {
      const object = byId.get(id);
      if (!object) return;
      const kids = children.get(id) ?? [];
      const expanded = !collapsed.has(id);
      rows.push({ object, depth, childCount: kids.length, expanded, joint: jointByChild.get(id), onToggle: toggle });
      if (expanded) for (const kid of kids) visit(kid, depth + 1);
    };
    for (const root of children.get(null) ?? []) visit(root, 1);
  }

  return (
    <div className="p-1.5" data-testid="objects-panel">
      {!q && (
        <div
          onDragOver={(event) => {
            if (!event.dataTransfer.types.includes(TREE_DRAG_TYPE)) return;
            event.preventDefault();
            setRootHover(true);
          }}
          onDragLeave={() => setRootHover(false)}
          onDrop={(event) => {
            event.preventDefault();
            setRootHover(false);
            const dragged = event.dataTransfer.getData(TREE_DRAG_TYPE);
            if (dragged) robotModel.reparent(dragged, null);
          }}
          data-testid="tree-root"
          className={cn('flex h-7 items-center gap-2 rounded-md px-1.5 text-xs font-semibold text-ink', rootHover && 'ring-1 ring-warn')}
          title="Drop a component here to detach it to the top level"
        >
          <Bot size={13} className="text-accent" />
          <span className="truncate">{projectName || 'Robot'}</span>
          <span className="ml-auto text-[10px] font-normal text-faint">
            {objects.length} parts · {joints.length} joints
          </span>
        </div>
      )}
      <ul role="tree" aria-label="Robot component tree">
        {rows.map((row) => (
          <TreeRow key={row.object.id} {...row} />
        ))}
      </ul>
      {!q && (
        <p className="flex items-start gap-1.5 px-2 pt-3 text-[10.5px] leading-relaxed text-faint">
          <CornerLeftUp size={11} className="mt-0.5 shrink-0" />
          Drag a part onto another part to attach it. Drop it on the robot name to detach it.
        </p>
      )}
    </div>
  );
}
