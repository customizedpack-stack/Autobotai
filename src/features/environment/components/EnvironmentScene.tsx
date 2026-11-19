import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { visibleToCameras } from '../../camera/render/cameraLayer';
import { memo, useCallback, useMemo, useRef } from 'react';
import { BufferGeometry, Float32BufferAttribute, type Group } from 'three';
import { useRobotStateStore } from '../../../stores/robotStateStore';
import type { EnvironmentDefinition, EnvironmentObject } from '../../../types/environment';
import { rampPoints } from '../../physics/engine/environmentColliders';
import { activePhysicsController } from '../../physics/simulation/simulationManager';
import { useSimulationStore } from '../../physics/simulation/simulationStore';
import { objectRegistry } from '../../viewport/objectRegistry';
import { resolveEnvironment, selectObject, useEnvironmentStore } from '../store/environmentStore';

/**
 * Draws the environment in the existing viewport:
 * - Environment Editor (Edit Mode): the open draft, pickable, the selected object outlined.
 * - Physics engine in Control Mode / Code Studio (Test Mode): the saved environment the
 *   simulation built. Dynamic objects follow their live physics pose every frame (read
 *   directly from the world, no React state). Kinematic mode shows no environment, since
 *   it has no physical world.
 */
export function EnvironmentScene() {
  const mode = useRobotStateStore((s) => s.mode);
  const engine = useSimulationStore((s) => s.engine);
  const selected = useSimulationStore((s) => s.settings.environment);
  const draft = useEnvironmentStore((s) => s.draft);
  const saved = useEnvironmentStore((s) => s.environments);
  const selectedId = useEnvironmentStore((s) => s.selectedId);
  const editing = mode === 'environment';
  const definition: EnvironmentDefinition | null = useMemo(() => {
    if (editing) return draft;
    if ((mode === 'control' || mode === 'code') && engine === 'physics') return resolveEnvironment(selected);
    return null;
    // `saved` keeps the resolved environment fresh after a save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, draft, mode, engine, selected, saved]);
  if (!definition) return null;
  return (
    <group name="environment">
      {definition.objects.map((o) =>
        o.visible || editing ? <EnvironmentMesh key={o.id} object={o} editing={editing} selected={editing && o.id === selectedId} /> : null,
      )}
    </group>
  );
}

function rampGeometry(size: EnvironmentObject['size']): BufferGeometry {
  const p = rampPoints(size);
  const v = (i: number) => [p[i * 3]!, p[i * 3 + 1]!, p[i * 3 + 2]!];
  // Vertices: 0,1 low edge; 2,3 high bottom; 4,5 high top (−Z, +Z pairs).
  const faces = [
    [0, 2, 3], [0, 3, 1], // bottom
    [2, 4, 5], [2, 5, 3], // high end
    [0, 1, 5], [0, 5, 4], // slope
    [0, 4, 2], // side −Z
    [1, 3, 5], // side +Z
  ];
  const positions: number[] = [];
  for (const f of faces) for (const i of f) positions.push(...v(i));
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(positions, 3));
  g.computeVertexNormals();
  return g;
}

function ObjectGeometry({ object }: { object: EnvironmentObject }) {
  const [x, y, z] = object.size;
  const ramp = useMemo(() => (object.kind === 'ramp' ? rampGeometry(object.size) : null), [object.kind, object.size]);
  if (ramp) return <primitive object={ramp} attach="geometry" />;
  if (object.kind === 'obstacle' && object.shape === 'cylinder') return <cylinderGeometry args={[x / 2, x / 2, y, 32]} />;
  if (object.kind === 'obstacle' && object.shape === 'sphere') return <sphereGeometry args={[x / 2, 32, 16]} />;
  return <boxGeometry args={[x, y, z]} />;
}

const EnvironmentMesh = memo(function EnvironmentMesh({ object, editing, selected }: { object: EnvironmentObject; editing: boolean; selected: boolean }) {
  const group = useRef<Group>(null);
  const register = useCallback(
    (g: Group | null) => {
      group.current = g;
      objectRegistry.set(object.id, g);
    },
    [object.id],
  );
  // Test Mode: dynamic objects follow the physics body.
  useFrame(() => {
    if (editing || object.body !== 'dynamic' || !group.current) return;
    const pose = activePhysicsController()?.physicsWorld?.environmentPose(object.id);
    if (!pose) return;
    group.current.position.set(pose.position[0], pose.position[1], pose.position[2]);
    group.current.quaternion.set(pose.rotation.x, pose.rotation.y, pose.rotation.z, pose.rotation.w);
  });
  const onClick = (event: ThreeEvent<MouseEvent>) => {
    if (!editing || event.delta > 3) return;
    event.stopPropagation();
    selectObject(object.id);
  };
  return (
    <group ref={register} name={object.name} position={object.position} rotation={object.rotation} userData={{ environmentObjectId: object.id }}>
      <mesh castShadow receiveShadow onClick={onClick} raycast={editing ? undefined : () => null} userData={{ environmentObjectId: object.id }} ref={visibleToCameras}>
        <ObjectGeometry object={object} />
        <meshStandardMaterial
          color={object.color}
          roughness={0.85}
          transparent={editing && (!object.visible || !object.collision)}
          opacity={editing && !object.visible ? 0.25 : editing && !object.collision ? 0.55 : 1}
          emissive={selected ? '#3B82F6' : '#000000'}
          emissiveIntensity={selected ? 0.35 : 0}
        />
      </mesh>
      {selected && (
        <mesh raycast={() => null} scale={1.02}>
          <ObjectGeometry object={object} />
          <meshBasicMaterial color="#60A5FA" wireframe transparent opacity={0.6} />
        </mesh>
      )}
    </group>
  );
});
