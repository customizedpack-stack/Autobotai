import { useRef, useSyncExternalStore } from 'react';
import { TransformControls } from '@react-three/drei';
import type { Object3D } from 'three';
import type { TransformControls as TransformControlsImpl } from 'three-stdlib';
import type { Vec3 } from '../../../types/scene';
import { useViewportStore } from '../../../stores/viewportStore';
import { gizmoInteraction, objectRegistry } from '../../viewport/objectRegistry';
import { normalizeSize } from '../config/environmentConfig';
import { beginTransientChange, endTransientChange, previewObject, useEnvironmentStore } from '../store/environmentStore';

const MODE_LABEL = { translate: 'Move', rotate: 'Rotate', scale: 'Resize' } as const;
const r = (v: number) => Number(v.toPrecision(12));

/**
 * Move / rotate / resize gizmo for the selected environment object. The same drei
 * TransformControls, toolbar modes (W/E/R), snapping and click guard as the robot
 * gizmo. A whole drag is ONE undo step (environment history). Move and rotate preview
 * live; resizing applies the new size when the drag ends (the object's scale is folded
 * into its size, so colliders always match what is drawn). Locked objects have no gizmo.
 */
export function EnvironmentGizmo() {
  const selectedId = useEnvironmentStore((s) => s.selectedId);
  const object = useEnvironmentStore((s) => s.draft?.objects.find((o) => o.id === selectedId));
  const mode = useViewportStore((s) => s.transformMode);
  const space = useViewportStore((s) => s.transformSpace);
  const snap = useViewportStore((s) => s.snap);
  const controls = useRef<TransformControlsImpl>(null);
  const target = useSyncExternalStore(objectRegistry.subscribe, () => objectRegistry.get(selectedId));
  if (!selectedId || !object || !target || mode === 'select' || object.locked) return null;

  const read = (t: Object3D) => ({ position: [r(t.position.x), r(t.position.y), r(t.position.z)] as Vec3, rotation: [r(t.rotation.x), r(t.rotation.y), r(t.rotation.z)] as Vec3 });

  return (
    <TransformControls
      ref={controls}
      object={target}
      mode={mode}
      space={space}
      size={0.8}
      translationSnap={snap ? 0.05 : null}
      rotationSnap={snap ? Math.PI / 12 : null}
      scaleSnap={snap ? 0.1 : null}
      onMouseDown={() => {
        gizmoInteraction.active = true;
        beginTransientChange();
      }}
      onObjectChange={() => {
        if (!gizmoInteraction.active || mode === 'scale') return;
        previewObject(selectedId, read(target));
      }}
      onMouseUp={() => {
        gizmoInteraction.active = false;
        gizmoInteraction.until = performance.now() + 250;
        if (mode === 'scale') {
          const s = target.scale;
          const size = normalizeSize(object, [object.size[0] * s.x, object.size[1] * s.y, object.size[2] * s.z]);
          target.scale.set(1, 1, 1);
          previewObject(selectedId, { size: size.map(r) as Vec3 });
        }
        endTransientChange(`${MODE_LABEL[mode]} ${object.name}`);
      }}
    />
  );
}
