import { useEffect, useMemo } from 'react';
import { BufferGeometry, CanvasTexture, Float32BufferAttribute, SRGBColorSpace } from 'three';

const LENGTH = 1;
const AXES = [
  { label: 'X', color: '#EF4444', end: [LENGTH, 0, 0] as const },
  { label: 'Y', color: '#22C55E', end: [0, LENGTH, 0] as const },
  { label: 'Z', color: '#3B82F6', end: [0, 0, LENGTH] as const },
];

function AxisLine({ end, color }: { end: readonly [number, number, number]; color: string }) {
  const geometry = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute([0, 0.0005, 0, end[0], end[1] + 0.0005, end[2]], 3));
    return g;
  }, [end]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color={color} transparent opacity={0.85} />
    </lineSegments>
  );
}

/**
 * Axis letter drawn as a sprite inside the WebGL scene. Sprites avoid DOM
 * overlays, which keeps mounting and unmounting the viewport clean.
 */
function AxisLabel({ label, color, position }: { label: string; color: string; position: [number, number, number] }) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.font = 'bold 40px ui-monospace, Menlo, Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = color;
      ctx.fillText(label, 32, 34);
    }
    const t = new CanvasTexture(canvas);
    t.colorSpace = SRGBColorSpace;
    return t;
  }, [label, color]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <sprite position={position} scale={[0.07, 0.07, 0.07]}>
      <spriteMaterial map={texture} transparent depthWrite={false} sizeAttenuation />
    </sprite>
  );
}

/** World X (red), Y (green, up) and Z (blue) axes with labels, 1 m long. */
export function SceneAxes() {
  return (
    <group>
      {AXES.map((axis) => (
        <group key={axis.label}>
          <AxisLine end={axis.end} color={axis.color} />
          <AxisLabel label={axis.label} color={axis.color} position={[axis.end[0] * 1.06, axis.end[1] * 1.06, axis.end[2] * 1.06]} />
        </group>
      ))}
    </group>
  );
}
