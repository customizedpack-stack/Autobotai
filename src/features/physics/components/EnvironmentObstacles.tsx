import { findEnvironment } from '../engine/environments';
import { useSimulationStore } from '../simulation/simulationStore';

/**
 * Draws the static obstacles of the selected environment. Shown only while the
 * Physics engine is selected, so Kinematic mode looks exactly as before.
 * Obstacles are not pickable (raycast disabled): they are not design parts.
 */
export function EnvironmentObstacles() {
  const engine = useSimulationStore((s) => s.engine);
  const environment = useSimulationStore((s) => s.settings.environment);
  if (engine !== 'physics') return null;
  const preset = findEnvironment(environment);
  return (
    <group name="physics-environment">
      {preset.obstacles.map((o) => (
        <mesh key={o.id} position={o.position} rotation={[0, o.yaw, 0]} castShadow receiveShadow raycast={() => null}>
          <boxGeometry args={o.size} />
          <meshStandardMaterial color={o.color} roughness={0.85} />
        </mesh>
      ))}
    </group>
  );
}
