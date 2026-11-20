import { memo, useCallback } from 'react';
import { Edges } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import type { Group } from 'three';
import type { RobotJoint } from '../../types/joint';
import type { PrimitiveGeometry, SceneObject, Transform } from '../../types/scene';
import { posedChildTransform } from '../robot-model/kinematics';
import { JointMarker } from './JointMarker';
import { visibleToCameras } from '../camera/render/cameraLayer';
import { objectRegistry } from './objectRegistry';

export function Geometry({ geometry }: { geometry: PrimitiveGeometry }) {
  switch (geometry.shape) {
    case 'box':
      return <boxGeometry args={geometry.size} />;
    case 'cylinder':
      return <cylinderGeometry args={[geometry.radius, geometry.radius, geometry.height, 40]} />;
    case 'sphere':
      return <sphereGeometry args={[geometry.radius, 32, 20]} />;
    case 'capsule':
      return <capsuleGeometry args={[geometry.radius, geometry.length, 8, 20]} />;
    case 'cone':
      return <coneGeometry args={[geometry.radius, geometry.height, 32]} />;
  }
}

export interface SceneTreeContext {
  byId: ReadonlyMap<string, SceneObject>;
  children: ReadonlyMap<string | null, string[]>;
  jointsByParent: ReadonlyMap<string, RobotJoint[]>;
  jointByChild: ReadonlyMap<string, RobotJoint>;
  /** Live (Control Mode) transforms of moving root components. */
  rootPoses: Readonly<Record<string, Transform>>;
  /** Live joint positions; the child is drawn moved around its joint. */
  jointPositions: Readonly<Record<string, number>>;
  selectedId: string | null;
  selectedJointId: string | null;
  hoveredId: string | null;
  /** Phase 11: part highlighted by Reverse Engineering inspection (read-only). */
  inspectedId?: string | null;
  dropTargetId: string | null;
  shadows: boolean;
  showJoints: boolean;
  onSelect: (id: string) => void;
  onSelectJoint: (id: string) => void;
  onHover: (id: string | null) => void;
}

/**
 * One component and, nested inside it, its children and the joints that
 * start at it. The group carries the component's LOCAL transform, so moving
 * a parent moves everything attached to it. Purely visual: no physics here.
 */
export const SceneObjectNode = memo(function SceneObjectNode({ id, ctx }: { id: string; ctx: SceneTreeContext }) {
  const object = ctx.byId.get(id);
  const register = useCallback((group: Group | null) => objectRegistry.set(id, group), [id]);
  if (!object) return null;
  // Design transform, replaced by the live pose while driving, then moved by its joint position.
  const base: SceneObject = ctx.rootPoses[id] ? { ...object, transform: ctx.rootPoses[id] } : object;
  const joint = ctx.jointByChild.get(id);
  const q = joint ? ctx.jointPositions[joint.id] ?? 0 : 0;
  const { position, rotation, scale } = joint && q !== 0 ? posedChildTransform(base, joint, q) : base.transform;
  const selected = id === ctx.selectedId;
  const hovered = id === ctx.hoveredId;
  const dropTarget = id === ctx.dropTargetId;
  const inspected = id === ctx.inspectedId;

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    // Ignore clicks that were really camera drags.
    if (event.delta > 3) return;
    ctx.onSelect(id);
  };

  return (
    <group ref={register} name={object.name} userData={{ objectId: id }} position={position} rotation={rotation} scale={scale}>
      {object.visible && (
        <mesh
          userData={{ objectId: id }}
          ref={visibleToCameras}
          castShadow={ctx.shadows}
          receiveShadow={ctx.shadows}
          onClick={handleClick}
          onPointerOver={(event) => {
            event.stopPropagation();
            ctx.onHover(id);
            document.body.style.cursor = 'pointer';
          }}
          onPointerOut={() => {
            ctx.onHover(null);
            document.body.style.cursor = '';
          }}
        >
          <Geometry geometry={object.geometry} />
          <meshStandardMaterial
            color={object.color}
            roughness={0.5}
            metalness={0.1}
            emissive={inspected ? '#A855F7' : selected ? '#3B82F6' : dropTarget ? '#F59E0B' : '#000000'}
            emissiveIntensity={inspected ? 0.35 : selected ? 0.18 : dropTarget ? 0.25 : 0}
          />
          {(selected || hovered || dropTarget || inspected) && (
            <Edges threshold={20} color={inspected ? '#C084FC' : dropTarget ? '#F59E0B' : selected ? '#60A5FA' : '#94A3B8'} lineWidth={selected || dropTarget || inspected ? 2 : 1} />
          )}
        </mesh>
      )}
      {ctx.showJoints &&
        (ctx.jointsByParent.get(id) ?? []).map((joint) => (
          <JointMarker key={joint.id} joint={joint} selected={joint.id === ctx.selectedJointId} onSelect={ctx.onSelectJoint} />
        ))}
      {(ctx.children.get(id) ?? []).map((childId) => (
        <SceneObjectNode key={childId} id={childId} ctx={ctx} />
      ))}
    </group>
  );
});
