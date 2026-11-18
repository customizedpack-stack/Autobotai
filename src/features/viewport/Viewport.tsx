import { useCallback, useEffect, useMemo, useRef, type DragEvent } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { GizmoHelper, GizmoViewport, Grid, OrbitControls } from '@react-three/drei';
import { Mesh, Plane, Raycaster, Vector2, Vector3, type Object3D } from 'three';
import { useShallow } from 'zustand/react/shallow';
import { useSceneStore } from '../../stores/sceneStore';
import { useSelectionStore } from '../../stores/selectionStore';
import { useRobotStateStore } from '../../stores/robotStateStore';
import { useViewportStore } from '../../stores/viewportStore';
import type { RobotJoint } from '../../types/joint';
import { computeDropPlacement, type PickHit } from '../builder/placement';
import { findComponent } from '../component-library/catalog';
import { placeComponent } from '../projects/workspaceActions';
import { childrenMap } from '../robot-model/hierarchy';
import { CameraRig } from './CameraRig';
import { COMPONENT_DRAG_TYPE } from './dragTypes';
import { gizmoInteraction, objectRegistry, viewportPicker } from './objectRegistry';
import { SceneAxes } from './SceneAxes';
import { Geometry, SceneObjectNode, type SceneTreeContext } from './SceneObjectNode';
import { TransformGizmo } from './TransformGizmo';
import { isWebGLAvailable } from './webgl';


/** The component hierarchy, rendered as nested groups from the roots down. */
function SceneTree() {
  const { objects, joints } = useSceneStore(useShallow((s) => ({ objects: s.objects, joints: s.joints })));
  const selectedId = useSelectionStore((s) => s.selectedId);
  const selectedJointId = useSelectionStore((s) => s.selectedJointId);
  const hoveredId = useSelectionStore((s) => s.hoveredId);
  const select = useSelectionStore((s) => s.select);
  const selectJoint = useSelectionStore((s) => s.selectJoint);
  const hover = useSelectionStore((s) => s.hover);
  const shadows = useViewportStore((s) => s.showShadows);
  const showJoints = useViewportStore((s) => s.showJoints);
  const dropTargetId = useViewportStore((s) => s.dropPreview?.parentId ?? null);
  const rootPoses = useRobotStateStore((s) => s.rootPoses);
  const jointPositions = useRobotStateStore((s) => s.jointPositions);

  const structure = useMemo(() => {
    const jointsByParent = new Map<string, RobotJoint[]>();
    for (const joint of joints) jointsByParent.set(joint.parentId, [...(jointsByParent.get(joint.parentId) ?? []), joint]);
    return {
      byId: new Map(objects.map((o) => [o.id, o])),
      children: childrenMap(objects),
      jointsByParent,
      jointByChild: new Map(joints.map((j) => [j.childId, j])),
    };
  }, [objects, joints]);

  const ctx: SceneTreeContext = {
    ...structure,
    selectedId,
    selectedJointId,
    hoveredId,
    dropTargetId,
    rootPoses,
    jointPositions,
    shadows,
    showJoints,
    onSelect: select,
    onSelectJoint: selectJoint,
    onHover: hover,
  };

  return (
    <>
      {(structure.children.get(null) ?? []).map((id) => (
        <SceneObjectNode key={id} id={id} ctx={ctx} />
      ))}
    </>
  );
}

/** Translucent preview of a component being dragged in from the library. */
function DropGhost() {
  const preview = useViewportStore((s) => s.dropPreview);
  const component = preview ? findComponent(preview.componentId) : undefined;
  if (!preview || !component) return null;
  return (
    <mesh position={preview.position} rotation={preview.rotation} renderOrder={5} raycast={() => null}>
      <Geometry geometry={component.geometry} />
      <meshStandardMaterial color={component.color} transparent opacity={0.45} depthWrite={false} emissive="#3B82F6" emissiveIntensity={0.2} />
    </mesh>
  );
}

/** Registers a picker so drop handlers outside the Canvas can raycast the scene. */
function PickingBridge() {
  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);
  const gl = useThree((s) => s.gl);

  useEffect(() => {
    const raycaster = new Raycaster();
    const ground = new Plane(new Vector3(0, 1, 0), 0);
    viewportPicker.register({
      pick: (clientX, clientY): PickHit | null => {
        const rect = gl.domElement.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return null;
        const ndc = new Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
        raycaster.setFromCamera(ndc, camera);
        const meshes: Object3D[] = [];
        scene.traverse((o) => {
          if (o instanceof Mesh && typeof o.userData.objectId === 'string' && o.visible) meshes.push(o);
        });
        const hit = raycaster.intersectObjects(meshes, false)[0];
        if (hit) {
          const normal = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : new Vector3(0, 1, 0);
          return { point: [hit.point.x, hit.point.y, hit.point.z], normal: [normal.x, normal.y, normal.z], objectId: hit.object.userData.objectId as string };
        }
        const point = new Vector3();
        if (!raycaster.ray.intersectPlane(ground, point)) return null;
        return { point: [point.x, 0, point.z], normal: [0, 1, 0], objectId: null };
      },
    });
    // Test hook, only when an end-to-end test sets window.__ARAI_E2E__ before the app loads:
    // screen position (CSS pixels) of a component's origin, so tests can grab gizmos precisely.
    const w = window as unknown as {
      __ARAI_E2E__?: boolean;
      __araiScreenPosition?: (id: string) => { x: number; y: number } | null;
      __araiIdByName?: (name: string) => string | undefined;
    };
    if (w.__ARAI_E2E__) {
      (w as unknown as { __araiCamera: () => number[] }).__araiCamera = () => camera.position.toArray();
      w.__araiIdByName = (name) => useSceneStore.getState().objects.find((o) => o.name === name)?.id;
      w.__araiScreenPosition = (id) => {
        const object = objectRegistry.get(id);
        if (!object) return null;
        const p = new Vector3().setFromMatrixPosition(object.matrixWorld).project(camera);
        const rect = gl.domElement.getBoundingClientRect();
        return { x: rect.left + ((p.x + 1) / 2) * rect.width, y: rect.top + ((1 - p.y) / 2) * rect.height };
      };
    }
    return () => viewportPicker.register(null);
  }, [camera, scene, gl]);

  return null;
}

function Lights({ shadows }: { shadows: boolean }) {
  return (
    <>
      <hemisphereLight args={['#e2e8f0', '#20242c', 1.1]} />
      <ambientLight intensity={0.45} />
      <directionalLight
        position={[3, 5, 2.5]}
        intensity={2.4}
        castShadow={shadows}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-3}
        shadow-camera-right={3}
        shadow-camera-top={3}
        shadow-camera-bottom={-3}
        shadow-bias={-0.0004}
      />
      <directionalLight position={[-3, 2.5, -2]} intensity={0.8} />
      <directionalLight position={[0, 1.5, 4]} intensity={0.35} />
    </>
  );
}

function WebGLUnavailable() {
  return (
    <div className="flex h-full items-center justify-center bg-viewport p-6 text-center">
      <div>
        <p className="text-sm font-semibold">3D view unavailable</p>
        <p className="mt-1 max-w-sm text-xs text-muted">
          Your browser or device has WebGL turned off. Use a recent Chrome, Edge, Firefox or Safari with hardware
          acceleration enabled.
        </p>
      </div>
    </div>
  );
}

/**
 * Reusable interactive 3D viewport. It reads editor state from stores and
 * contains no editor UI. Drops from the component library are handled here
 * because they need the camera; placement rules live in features/builder.
 * In Phase 5, poses will come from the physics engine (C4) instead.
 */
export function Viewport() {
  const showGrid = useViewportStore((s) => s.showGrid);
  const showAxes = useViewportStore((s) => s.showAxes);
  const shadows = useViewportStore((s) => s.showShadows);
  const clear = useSelectionStore((s) => s.clear);
  const frame = useRef(0);

  const onPointerMissed = useCallback(() => {
    if (gizmoInteraction.active || performance.now() < gizmoInteraction.until) return;
    clear();
  }, [clear]);

  const control = useRobotStateStore((s) => s.mode !== 'build');
  // No drops in Control Mode or Code Studio: the design is locked while driving.
  const draggedComponent = () => (useRobotStateStore.getState().mode !== 'build' ? null : useViewportStore.getState().draggingComponentId);

  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    const componentId = draggedComponent();
    if (!componentId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    const { clientX, clientY } = event;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const component = findComponent(componentId);
      const hit = viewportPicker.pick(clientX, clientY);
      if (!component || !hit) return;
      const { parentId, world } = computeDropPlacement(component, hit, useSceneStore.getState().objects);
      useViewportStore.getState().setDropPreview({ componentId, position: world.position, rotation: world.rotation, parentId });
    });
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    const componentId = event.dataTransfer.getData(COMPONENT_DRAG_TYPE) || draggedComponent();
    if (!componentId) return;
    event.preventDefault();
    cancelAnimationFrame(frame.current);
    const hit = viewportPicker.pick(event.clientX, event.clientY);
    useViewportStore.getState().setDraggingComponent(null);
    if (hit) placeComponent(componentId, hit);
  };

  const onDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    cancelAnimationFrame(frame.current);
    useViewportStore.getState().setDropPreview(null);
  };

  if (!isWebGLAvailable()) return <WebGLUnavailable />;

  return (
    <div className="absolute inset-0" onDragOver={onDragOver} onDrop={onDrop} onDragLeave={onDragLeave} data-testid="viewport-dropzone">
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [1.3, 1.0, 1.3], fov: 45, near: 0.01, far: 200 }}
        onPointerMissed={onPointerMissed}
        gl={{ antialias: true, preserveDrawingBuffer: true }}
        aria-label="3D viewport"
      >
        <color attach="background" args={['#0d0f13']} />
        <fog attach="fog" args={['#0d0f13', 12, 40]} />
        <Lights shadows={shadows} />

        {shadows && (
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.0005, 0]} receiveShadow raycast={() => null}>
            <planeGeometry args={[40, 40]} />
            <shadowMaterial transparent opacity={0.5} />
          </mesh>
        )}

        {showGrid && (
          <Grid
            position={[0, -0.001, 0]}
            infiniteGrid
            cellSize={0.1}
            cellThickness={0.8}
            cellColor="#2b323d"
            sectionSize={1}
            sectionThickness={1.1}
            sectionColor="#465062"
            fadeDistance={30}
            fadeStrength={1.2}
          />
        )}
        {showAxes && <SceneAxes />}

        <SceneTree />
        <DropGhost />
        {!control && <TransformGizmo />}

        <OrbitControls makeDefault enableDamping dampingFactor={0.12} minDistance={0.15} maxDistance={60} />
        <CameraRig />
        <PickingBridge />

        <GizmoHelper alignment="bottom-right" margin={[64, 64]}>
          <GizmoViewport axisColors={['#EF4444', '#22C55E', '#3B82F6']} labelColor="#0d0f13" />
        </GizmoHelper>
      </Canvas>
    </div>
  );
}
