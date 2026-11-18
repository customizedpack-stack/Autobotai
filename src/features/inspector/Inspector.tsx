import { useState, type ReactNode } from 'react';
import { Copy, Eye, EyeOff, MousePointerClick, RotateCcw, Trash2 } from 'lucide-react';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { useProjectStore } from '../../stores/projectStore';
import { useSceneStore } from '../../stores/sceneStore';
import { useSelectionStore } from '../../stores/selectionStore';
import { useSettingsStore } from '../../stores/settingsStore';
import type { SceneObject, Transform, Vec3 } from '../../types/scene';
import { formatRelativeTime } from '../../utils/format';
import { DEG_TO_RAD, RAD_TO_DEG, describeGeometry } from '../../utils/math';
import { COMPONENT_CATEGORIES, findComponent } from '../component-library/catalog';
import { deleteSelected, duplicateSelected } from '../projects/workspaceActions';
import { categoryLabel, findTemplate } from '../robot-library/templates';
import { NumberField } from './NumberField';

const AXIS_COLORS = ['#EF4444', '#22C55E', '#3B82F6'] as const;
const AXIS_LABELS = ['X', 'Y', 'Z'] as const;

function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="border-b border-line-soft px-3 py-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[10.5px] font-semibold tracking-wider text-muted uppercase">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-0.5 text-xs">
      <span className="shrink-0 text-faint">{label}</span>
      <span className="min-w-0 text-right break-words">{children}</span>
    </div>
  );
}

interface VectorRowProps {
  label: string;
  unit: string;
  values: Vec3;
  step: number;
  decimals: number;
  min?: number;
  testId: string;
  onCommit: (values: Vec3) => void;
}

function VectorRow({ label, unit, values, step, decimals, min, testId, onCommit }: VectorRowProps) {
  return (
    <div className="mb-2 last:mb-0">
      <div className="mb-1 flex items-center justify-between text-[11px] text-muted">
        <span>{label}</span>
        <span className="font-mono text-[10px] text-faint">{unit}</span>
      </div>
      <div className="grid grid-cols-3 gap-1">
        {values.map((value, axis) => (
          <NumberField
            key={AXIS_LABELS[axis]}
            label={AXIS_LABELS[axis]}
            tagColor={AXIS_COLORS[axis]}
            value={value}
            step={step}
            decimals={decimals}
            min={min}
            testId={`${testId}-${AXIS_LABELS[axis].toLowerCase()}`}
            onCommit={(next) => {
              const updated: Vec3 = [...values];
              updated[axis] = next;
              onCommit(updated);
            }}
          />
        ))}
      </div>
    </div>
  );
}

function NameField({ object }: { object: SceneObject }) {
  const renameObject = useSceneStore((s) => s.renameObject);
  const [text, setText] = useState(object.name);
  const commit = () => {
    if (text.trim()) renameObject(object.id, text);
    else setText(object.name);
  };
  return (
    <input
      value={text}
      aria-label="Object name"
      data-testid="inspector-name"
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          setText(object.name);
          e.currentTarget.blur();
        }
      }}
      className="h-8 w-full rounded-md border border-line bg-app px-2 text-[13px] font-medium outline-none focus:border-accent"
    />
  );
}

function ObjectInspector({ object }: { object: SceneObject }) {
  const updateTransform = useSceneStore((s) => s.updateTransform);
  const setVisible = useSceneStore((s) => s.setVisible);
  const rotationUnit = useSettingsStore((s) => s.rotationUnit);
  const positionStep = useSettingsStore((s) => s.positionStep);
  const component = object.metadata.componentId ? findComponent(object.metadata.componentId) : undefined;
  const categoryName = COMPONENT_CATEGORIES.find((c) => c.id === object.category)?.label ?? object.category;
  const { position, rotation, scale } = object.transform;
  const inDegrees = rotationUnit === 'deg';
  const displayRotation: Vec3 = inDegrees ? [rotation[0] * RAD_TO_DEG, rotation[1] * RAD_TO_DEG, rotation[2] * RAD_TO_DEG] : rotation;

  const commit = (patch: Partial<Transform>) => updateTransform(object.id, patch);

  return (
    <div data-testid="object-inspector">
      <Section title="Object">
        <NameField key={`${object.id}:${object.name}`} object={object} />
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Badge tone="accent">{categoryName}</Badge>
          <Badge>{object.geometry.shape}</Badge>
          {!object.visible && <Badge tone="warn">Hidden</Badge>}
        </div>
      </Section>

      <Section
        title="Transform"
        action={
          <button
            type="button"
            className="inline-flex items-center gap-1 text-[11px] text-muted hover:text-ink"
            onClick={() => commit({ rotation: [0, 0, 0], scale: [1, 1, 1] })}
            title="Reset rotation and scale"
          >
            <RotateCcw size={11} /> Reset
          </button>
        }
      >
        <VectorRow label="Position" unit="m" values={position} step={positionStep} decimals={3} testId="pos" onCommit={(v) => commit({ position: v })} />
        <VectorRow
          label="Rotation"
          unit={inDegrees ? 'deg' : 'rad'}
          values={displayRotation}
          step={inDegrees ? 5 : 0.05}
          decimals={inDegrees ? 1 : 3}
          testId="rot"
          onCommit={(v) => commit({ rotation: inDegrees ? [v[0] * DEG_TO_RAD, v[1] * DEG_TO_RAD, v[2] * DEG_TO_RAD] : v })}
        />
        <VectorRow label="Scale" unit="×" values={scale} step={0.1} decimals={3} min={0.01} testId="scl" onCommit={(v) => commit({ scale: v })} />
      </Section>

      <Section title="Metadata">
        <Row label="ID">
          <span className="font-mono text-[11px] text-muted">{object.id}</span>
        </Row>
        <Row label="Geometry">{describeGeometry(object.geometry)}</Row>
        <Row label="Component">{component?.name ?? 'Template part'}</Row>
        <Row label="Color">
          <span className="inline-flex items-center gap-1.5 font-mono text-[11px]">
            <span className="h-3 w-3 rounded-sm border border-line" style={{ background: object.color }} />
            {object.color}
          </span>
        </Row>
        <Row label="Created">{formatRelativeTime(object.metadata.createdAt)}</Row>
        {object.metadata.description && <p className="mt-2 text-[11.5px] leading-relaxed text-muted">{object.metadata.description}</p>}
        {component && <p className="mt-2 text-[11px] text-faint">Functional in {component.functionalIn}.</p>}
      </Section>

      <div className="flex flex-wrap gap-1.5 p-3">
        <Button size="sm" icon={object.visible ? <EyeOff size={13} /> : <Eye size={13} />} onClick={() => setVisible(object.id, !object.visible)}>
          {object.visible ? 'Hide' : 'Show'}
        </Button>
        <Button size="sm" icon={<Copy size={13} />} onClick={duplicateSelected} title="Duplicate (Ctrl+D)">
          Duplicate
        </Button>
        <Button size="sm" variant="danger" icon={<Trash2 size={13} />} onClick={deleteSelected} title="Delete (Del)">
          Delete
        </Button>
      </div>
    </div>
  );
}

function ProjectSummary() {
  const projectId = useSceneStore((s) => s.projectId);
  const projectName = useSceneStore((s) => s.projectName);
  const objectCount = useSceneStore((s) => s.objects.length);
  const dirty = useSceneStore((s) => s.dirty);
  const project = useProjectStore((s) => (projectId ? s.projects[projectId] : undefined));
  if (!project) return null;
  return (
    <div data-testid="project-inspector">
      <Section title="Project">
        <div className="text-[13px] font-semibold">{projectName}</div>
        <div className="mt-2">
          <Row label="Category">{categoryLabel(project.category)}</Row>
          <Row label="Template">{findTemplate(project.templateId)?.name ?? project.templateId}</Row>
          <Row label="Objects">{objectCount}</Row>
          <Row label="Schema">v{project.schemaVersion}</Row>
          <Row label="Created">{formatRelativeTime(project.createdAt)}</Row>
          <Row label="Last saved">{dirty ? 'Unsaved changes' : formatRelativeTime(project.savedAt)}</Row>
        </div>
      </Section>
      <div className="flex flex-col items-center px-6 py-8 text-center">
        <MousePointerClick size={18} className="text-faint" />
        <p className="mt-2 text-xs text-muted">Select an object in the viewport or the Objects list to inspect and edit it.</p>
      </div>
    </div>
  );
}

/** Right-hand properties inspector. */
export function Inspector() {
  const selectedId = useSelectionStore((s) => s.selectedId);
  const object = useSceneStore((s) => s.objects.find((o) => o.id === selectedId));
  return object ? <ObjectInspector key={object.id} object={object} /> : <ProjectSummary />;
}
