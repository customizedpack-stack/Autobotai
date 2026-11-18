import { useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import { BufferAttribute, BufferGeometry, DynamicDrawUsage } from 'three';
import type { DebugSnapshot } from '../integration/physicsController';
import { getDebugSnapshot } from '../simulation/simulationManager';
import { useSimulationStore } from '../simulation/simulationStore';

const MAX_LINE_VERTICES = 60_000;
const MAX_EXTRA = 2_000;
const VELOCITY_SCALE = 0.25;
const AXIS_LENGTH = 0.08;

/**
 * Physics debug visualization. Reads the physics world once per rendered frame
 * through the simulation manager (read-only) and writes straight into GPU buffers,
 * so it causes no React updates:
 * - collision shapes and the ground (Rapier debug lines, colored by body state),
 * - joint anchors (yellow points) and joint axes (yellow lines),
 * - body velocities (cyan lines),
 * - contact points (red points).
 */
export function PhysicsDebugView() {
  const visible = useSimulationStore((s) => s.engine === 'physics' && s.settings.debug && (s.state === 'running' || s.state === 'paused'));
  if (!visible) return null;
  return <DebugLayers />;
}

function makeGeometry(vertices: number, withColor: boolean): BufferGeometry {
  const g = new BufferGeometry();
  const pos = new BufferAttribute(new Float32Array(vertices * 3), 3);
  pos.setUsage(DynamicDrawUsage);
  g.setAttribute('position', pos);
  if (withColor) {
    const col = new BufferAttribute(new Float32Array(vertices * 4), 4);
    col.setUsage(DynamicDrawUsage);
    g.setAttribute('color', col);
  }
  g.setDrawRange(0, 0);
  return g;
}

interface Layers {
  shapes: BufferGeometry;
  axes: BufferGeometry;
  velocities: BufferGeometry;
  anchors: BufferGeometry;
  contacts: BufferGeometry;
}

/** Copy one debug snapshot into the GPU buffers (outside React state). */
function updateLayers({ shapes, axes, velocities, anchors, contacts }: Layers, snap: DebugSnapshot | null): void {
    if (!snap) {
      for (const g of [shapes, axes, velocities, anchors, contacts]) g.setDrawRange(0, 0);
      return;
    }
    // Collision shapes + ground.
    const n = Math.min(snap.lines.length / 3, MAX_LINE_VERTICES);
    (shapes.attributes.position!.array as Float32Array).set(snap.lines.subarray(0, n * 3));
    (shapes.attributes.color!.array as Float32Array).set(snap.colors.subarray(0, n * 4));
    shapes.attributes.position!.needsUpdate = true;
    shapes.attributes.color!.needsUpdate = true;
    shapes.setDrawRange(0, n);
    shapes.computeBoundingSphere();

    // Joint axes and anchors.
    const ax = axes.attributes.position!.array as Float32Array;
    const an = anchors.attributes.position!.array as Float32Array;
    let a = 0;
    let p = 0;
    for (const j of snap.anchors) {
      if (a + 6 > ax.length) break;
      const [x, y, z] = j.position;
      ax.set([x - j.axis[0] * AXIS_LENGTH, y - j.axis[1] * AXIS_LENGTH, z - j.axis[2] * AXIS_LENGTH, x + j.axis[0] * AXIS_LENGTH, y + j.axis[1] * AXIS_LENGTH, z + j.axis[2] * AXIS_LENGTH], a);
      a += 6;
      an.set(j.position, p);
      p += 3;
    }
    axes.attributes.position!.needsUpdate = true;
    axes.setDrawRange(0, a / 3);
    anchors.attributes.position!.needsUpdate = true;
    anchors.setDrawRange(0, p / 3);

    // Velocities.
    const ve = velocities.attributes.position!.array as Float32Array;
    let v = 0;
    for (const b of snap.bodies) {
      if (v + 6 > ve.length) break;
      const [x, y, z] = b.position;
      ve.set([x, y, z, x + b.velocity[0] * VELOCITY_SCALE, y + b.velocity[1] * VELOCITY_SCALE, z + b.velocity[2] * VELOCITY_SCALE], v);
      v += 6;
    }
    velocities.attributes.position!.needsUpdate = true;
    velocities.setDrawRange(0, v / 3);

    // Contacts.
    const co = contacts.attributes.position!.array as Float32Array;
    let c = 0;
    for (const pt of snap.contacts) {
      if (c + 3 > co.length) break;
      co.set(pt, c);
      c += 3;
    }
    contacts.attributes.position!.needsUpdate = true;
    contacts.setDrawRange(0, c / 3);
    for (const g of [axes, velocities, anchors, contacts]) g.computeBoundingSphere();
}

function DebugLayers() {
  const shapes = useMemo(() => makeGeometry(MAX_LINE_VERTICES, true), []);
  const axes = useMemo(() => makeGeometry(MAX_EXTRA, false), []);
  const velocities = useMemo(() => makeGeometry(MAX_EXTRA, false), []);
  const anchors = useMemo(() => makeGeometry(MAX_EXTRA, false), []);
  const contacts = useMemo(() => makeGeometry(MAX_EXTRA, false), []);

  const layers = useMemo<Layers>(() => ({ shapes, axes, velocities, anchors, contacts }), [shapes, axes, velocities, anchors, contacts]);
  useFrame(() => updateLayers(layers, getDebugSnapshot()));

  return (
    <group name="physics-debug" renderOrder={10}>
      <lineSegments geometry={shapes} frustumCulled={false} raycast={() => null}>
        <lineBasicMaterial vertexColors transparent opacity={0.9} depthTest={false} />
      </lineSegments>
      <lineSegments geometry={axes} frustumCulled={false} raycast={() => null}>
        <lineBasicMaterial color="#facc15" depthTest={false} />
      </lineSegments>
      <lineSegments geometry={velocities} frustumCulled={false} raycast={() => null}>
        <lineBasicMaterial color="#22d3ee" depthTest={false} />
      </lineSegments>
      <points geometry={anchors} frustumCulled={false} raycast={() => null}>
        <pointsMaterial color="#facc15" size={7} sizeAttenuation={false} depthTest={false} />
      </points>
      <points geometry={contacts} frustumCulled={false} raycast={() => null}>
        <pointsMaterial color="#ef4444" size={6} sizeAttenuation={false} depthTest={false} />
      </points>
    </group>
  );
}
