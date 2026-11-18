import { useMemo, useState, type ReactNode } from 'react';
import { Copy, Eye, EyeOff, Link2, MousePointerClick, Plus, RotateCcw, Trash2 } from 'lucide-react';

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
import { flattenTree, validParentIds } from '../robot-model/hierarchy';
import { jointTypeLabel } from '../robot-model/joints';
import { robotModel } from '../robot-model/robotModelConnector';
import { indexObjects, worldPosition } from '../robot-model/transforms';
import { validateRobotModel } from '../robot-model/validation';
import { categoryLabel, findTemplate } from '../robot-library/templates';
import { JOINT_COLORS } from '../viewport/jointStyle';
import { ControllerSection } from './ControllerSection';
import { JointDialog } from './JointDialog';
import { JointInspector } from './JointInspector';
import { PhysicsSection } from './PhysicsSection';
import { PartSensors, SensorsSection } from '../sensors/components/SensorsSection';
import { VectorRow } from './VectorRow';

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

/** For motor parts: which actuator uses this part. */
function ActuatorUsage({ objectId }: { objectId: string }) {
  const actuator = useSceneStore((s) => s.actuators.find((a) => a.componentId === objectId));
  const joint = useSceneStore((s) => s.joints.find((j) => j.id === actuator?.jointId));
  if (!actuator) return null;
  return (
    <Row label="Drives">
      <span data-testid="actuator-usage">
        {actuator.name} → {joint?.name ?? 'joint'}
      </span>
    </Row>
  );
}

/** Parent selector, children, and the joint that connects this component to its parent. */
function HierarchySection({ object }: { object: SceneObject }) {
  const objects = useSceneStore((s) => s.objects);
  const joints = useSceneStore((s) => s.joints);
  const select = useSelectionStore((s) => s.select);
  const selectJoint = useSelectionStore((s) => s.selectJoint);
  const [dialogOpen, setDialogOpen] = useState(false);
  const byId = useMemo(() => new Map(objects.map((o) => [o.id, o])), [objects]);
  const allowed = useMemo(() => new Set(validParentIds(objects, object.id)), [objects, object.id]);
  const order = useMemo(() => flattenTree(objects), [objects]);
  const children = objects.filter((o) => o.parentId === object.id);
  const joint = joints.find((j) => j.childId === object.id);
  const world = worldPosition(object.id, indexObjects(objects));

  return (
    <Section title="Hierarchy">
      <label className="block">
        <span className="mb-1 block text-[11px] text-muted">Parent</span>
        <select
          value={object.parentId ?? ''}
          onChange={(e) => robotModel.reparent(object.id, e.target.value || null)}
          aria-label="Parent component"
          data-testid="parent-select"
          className="h-8 w-full rounded-md border border-line bg-app px-2 text-xs outline-none focus:border-accent"
        >
          <option value="">None (top level)</option>
          {order
            .filter(({ id }) => allowed.has(id))
            .map(({ id, depth }) => (
              <option key={id} value={id}>
                {'\u00A0\u00A0'.repeat(depth)}
                {byId.get(id)?.name}
              </option>
            ))}
        </select>
      </label>
      <p className="mt-1 text-[10.5px] text-faint">Changing the parent keeps the part where it is in the world.</p>
      <Row label="World position">
        <span className="font-mono text-[11px] text-muted" data-testid="world-position">
          {world.map((v) => v.toFixed(3)).join(', ')}
        </span>
      </Row>
      {children.length > 0 && (
        <div className="mt-2">
          <div className="mb-1 text-[11px] text-muted">Attached parts ({children.length})</div>
          <div className="flex flex-wrap gap-1">
            {children.map((c) => (
              <button key={c.id} type="button" onClick={() => select(c.id)} className="rounded bg-raised px-1.5 py-0.5 text-[11px] text-muted hover:text-ink">
                {c.name}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="mt-3">
        <div className="mb-1 text-[11px] text-muted">Joint to parent</div>
        {joint ? (
          <button
            type="button"
            onClick={() => selectJoint(joint.id)}
            data-testid="object-joint-link"
            className="flex w-full items-center gap-2 rounded-md border border-line px-2 py-1.5 text-left text-xs hover:border-accent"
          >
            <Link2 size={12} style={{ color: JOINT_COLORS[joint.type] }} />
            <span className="min-w-0 flex-1 truncate">{joint.name}</span>
            <span className="text-[10.5px] text-faint">{jointTypeLabel(joint.type)}</span>
          </button>
        ) : (
          <Button size="sm" icon={<Plus size={13} />} onClick={() => setDialogOpen(true)} data-testid="add-joint">
            Add joint…
          </Button>
        )}
      </div>
      <JointDialog open={dialogOpen} onClose={() => setDialogOpen(false)} childId={object.id} />
    </Section>
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

      <HierarchySection object={object} />

      <Section
        title={object.parentId ? 'Transform (relative to parent)' : 'Transform'}
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

      <Section title="Physics">
        <PhysicsSection object={object} />
      </Section>

      <Section title="Sensors on this part">
        <PartSensors partId={object.id} />
      </Section>

      <Section title="Metadata">
        <Row label="ID">
          <span className="font-mono text-[11px] text-muted">{object.id}</span>
        </Row>
        <Row label="Geometry">{describeGeometry(object.geometry)}</Row>
        <Row label="Component">{component?.name ?? 'Template part'}</Row>
        <ActuatorUsage objectId={object.id} />
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
  const objects = useSceneStore((s) => s.objects);
  const joints = useSceneStore((s) => s.joints);
  const objectCount = objects.length;
  const actuators = useSceneStore((s) => s.actuators);
  const controllers = useSceneStore((s) => s.controllers);
  const issues = useMemo(() => validateRobotModel(objects, joints, actuators, controllers), [objects, joints, actuators, controllers]);
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
          <Row label="Components">{objectCount}</Row>
          <Row label="Joints">{joints.length}</Row>
          <Row label="Actuators">{actuators.length}</Row>
          <Row label="Model check">
            <span data-testid="model-check" className={issues.some((i) => i.severity === 'error') ? 'text-err' : 'text-ok'}>
              {issues.length === 0 ? 'Valid' : `${issues.length} issue(s)`}
            </span>
          </Row>
          <Row label="Schema">v{project.schemaVersion}</Row>
          <Row label="Created">{formatRelativeTime(project.createdAt)}</Row>
          <Row label="Last saved">{dirty ? 'Unsaved changes' : formatRelativeTime(project.savedAt)}</Row>
        </div>
      </Section>
      <ControllerSection />
      <SensorsSection />
      <div className="flex flex-col items-center px-6 py-8 text-center">
        <MousePointerClick size={18} className="text-faint" />
        <p className="mt-2 text-xs text-muted">Select a part or a joint marker in the viewport or the Objects tree to inspect and edit it.</p>
      </div>
      {issues.length > 0 && (
        <ul className="space-y-1 px-3 pb-3 text-[11px] text-warn">
          {issues.map((i) => (
            <li key={i.message}>{i.message}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Right-hand properties inspector: a component, a joint, or the project summary. */
export function Inspector() {
  const selectedId = useSelectionStore((s) => s.selectedId);
  const selectedJointId = useSelectionStore((s) => s.selectedJointId);
  const object = useSceneStore((s) => s.objects.find((o) => o.id === selectedId));
  const joint = useSceneStore((s) => s.joints.find((j) => j.id === selectedJointId));
  if (joint) return <JointInspector key={joint.id} joint={joint} />;
  return object ? <ObjectInspector key={object.id} object={object} /> : <ProjectSummary />;
}
