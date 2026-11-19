import { useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import { BufferAttribute, BufferGeometry, DynamicDrawUsage } from 'three';
import { useSceneStore } from '../../../stores/sceneStore';
import { useSensorStore } from '../core/sensorStore';
import type { DistanceReading } from '../core/sensorTypes';
import { sensorStream } from '../stream/sensorStream';

const MAX = 15 * 8;

/**
 * Distance-sensor debug view: for every ray, a line from the sensor to the hit point
 * (red) or to the maximum range (green), the hit points, and the sensor origin.
 * Reads the latest readings from the stream once per rendered frame (no React state).
 * Purely visual: it never touches the physics world.
 */
export function SensorRaysView() {
  const visible = useSensorStore((s) => s.showRays && s.stream !== 'off');
  const hasDistance = useSceneStore((s) => s.sensors.some((x) => x.type === 'distance' && x.enabled));
  if (!visible || !hasDistance) return null;
  return <RayLayers />;
}

function geometry(vertices: number, colors: boolean): BufferGeometry {
  const g = new BufferGeometry();
  const p = new BufferAttribute(new Float32Array(vertices * 3), 3);
  p.setUsage(DynamicDrawUsage);
  g.setAttribute('position', p);
  if (colors) {
    const c = new BufferAttribute(new Float32Array(vertices * 3), 3);
    c.setUsage(DynamicDrawUsage);
    g.setAttribute('color', c);
  }
  g.setDrawRange(0, 0);
  return g;
}

interface Layers {
  lines: BufferGeometry;
  hits: BufferGeometry;
  origins: BufferGeometry;
}

function update({ lines, hits, origins }: Layers, readings: DistanceReading[]): void {
  const lp = lines.attributes.position!.array as Float32Array;
  const lc = lines.attributes.color!.array as Float32Array;
  const hp = hits.attributes.position!.array as Float32Array;
  const op = origins.attributes.position!.array as Float32Array;
  let l = 0;
  let h = 0;
  let o = 0;
  for (const r of readings) {
    if (o + 3 <= op.length) {
      op.set([r.origin.x, r.origin.y, r.origin.z], o);
      o += 3;
    }
    if (!r.valid) continue;
    for (const ray of r.rays) {
      if (l + 6 > lp.length) break;
      const d = ray.direction;
      const end: [number, number, number] = ray.hitPoint
        ? [ray.hitPoint.x, ray.hitPoint.y, ray.hitPoint.z]
        : [r.origin.x + d.x * r.maxRange, r.origin.y + d.y * r.maxRange, r.origin.z + d.z * r.maxRange];
      lp.set([r.origin.x, r.origin.y, r.origin.z, ...end], l);
      const color = ray.detected ? [0.94, 0.27, 0.27] : [0.13, 0.77, 0.37];
      lc.set([...color, ...color], l);
      l += 6;
      if (ray.hitPoint && h + 3 <= hp.length) {
        hp.set(end, h);
        h += 3;
      }
    }
  }
  lines.attributes.position!.needsUpdate = true;
  lines.attributes.color!.needsUpdate = true;
  hits.attributes.position!.needsUpdate = true;
  origins.attributes.position!.needsUpdate = true;
  lines.setDrawRange(0, l / 3);
  hits.setDrawRange(0, h / 3);
  origins.setDrawRange(0, o / 3);
  for (const g of [lines, hits, origins]) g.computeBoundingSphere();
}

function RayLayers() {
  const lines = useMemo(() => geometry(MAX * 2, true), []);
  const hits = useMemo(() => geometry(MAX, false), []);
  const origins = useMemo(() => geometry(16, false), []);
  const layers = useMemo<Layers>(() => ({ lines, hits, origins }), [lines, hits, origins]);
  useFrame(() => {
    const ids = useSceneStore.getState().sensors.filter((s) => s.type === 'distance' && s.enabled).map((s) => s.id);
    const readings = ids.map((id) => sensorStream.latest(id)).filter((r): r is DistanceReading => r?.type === 'distance');
    update(layers, readings);
  });
  return (
    <group name="sensor-rays" renderOrder={11}>
      <lineSegments geometry={lines} frustumCulled={false} raycast={() => null}>
        <lineBasicMaterial vertexColors transparent opacity={0.85} depthTest={false} />
      </lineSegments>
      <points geometry={hits} frustumCulled={false} raycast={() => null}>
        <pointsMaterial color="#ef4444" size={8} sizeAttenuation={false} depthTest={false} />
      </points>
      <points geometry={origins} frustumCulled={false} raycast={() => null}>
        <pointsMaterial color="#22c55e" size={6} sizeAttenuation={false} depthTest={false} />
      </points>
    </group>
  );
}
