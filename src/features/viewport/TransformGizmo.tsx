import { useRef, useSyncExternalStore } from 'react';
import { TransformControls } from '@react-three/drei';
import type { Object3D } from 'three';
import type { TransformControls as TransformControlsImpl } from 'three-stdlib';
import { useSceneStore } from '../../stores/sceneStore';
import { useSelectionStore } from '../../stores/selectionStore';
import { useViewportStore } from '../../stores/viewportStore';
import type { Transform } from '../../types/scene';
import { gizmoInteraction, objectRegistry } from './objectRegistry';

const MODE_LABEL = { translate: 'Move', rotate: 'Rotate', scale: 'Scale' } as const;


function readTransform(object: Object3D): Transform {
  const r = (v: number) => Number(v.toPrecision(12));
  return {
    position: [r(object.position.x), r(object.position.y), r(object.position.z)],
    rotation: [r(object.rotation.x), r(object.rotation.y), r(object.rotation.z)],
    scale: [r(object.scale.x), r(object.scale.y), r(object.scale.z)],
  };
}

/**
 * Move / rotate / scale gizmo for the selected component.
 * During a drag the store is updated live (inspector follows), and the whole
 * drag becomes ONE undo step through sceneStore's transient change. The
 * gizmo edits the same LOCAL transform the inspector edits; there is one
 * transform system.
 */
export function TransformGizmo() {
  const selectedId = useSelectionStore((s) => s.selectedId);
  const visible = useSceneStore((s) => s.objects.find((o) => o.id === selectedId)?.visible ?? true);
  const mode = useViewportStore((s) => s.transformMode);
  const space = useViewportStore((s) => s.transformSpace);
  const snap = useViewportStore((s) => s.snap);
  const controls = useRef<TransformControlsImpl>(null);
  // Re-render when the selected component's group mounts or unmounts.
  const target = useSyncExternalStore(objectRegistry.subscribe, () => objectRegistry.get(selectedId));

  if (!selectedId || !target || mode === 'select' || !visible) return null;

  return (
    <TransformControls
      ref={controls}
      object={target}
      mode={mode}
      space={space}
      size={0.8}
      translationSnap={snap ? 0.01 : null}
      rotationSnap={snap ? Math.PI / 12 : null}
      scaleSnap={snap ? 0.1 : null}
      onMouseDown={() => {
        gizmoInteraction.active = true;
        useSceneStore.getState().beginTransientChange();
      }}
      onObjectChange={() => {
        if (!gizmoInteraction.active) return;
        useSceneStore.getState().previewTransform(selectedId, readTransform(target));
      }}
      onMouseUp={() => {
        gizmoInteraction.active = false;
        gizmoInteraction.until = performance.now() + 250;
        const name = useSceneStore.getState().objects.find((o) => o.id === selectedId)?.name ?? 'component';
        useSceneStore.getState().endTransientChange(`${MODE_LABEL[mode]} ${name}`);
      }}
    />
  );
}
