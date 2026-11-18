import { memo, useMemo } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { Quaternion, Vector3 } from 'three';
import type { RobotJoint } from '../../types/joint';
import { JOINT_COLORS } from './jointStyle';

const UP = new Vector3(0, 1, 0);

/**
 * Visual marker for a joint, drawn in the parent component's frame at the
 * joint origin. Revolute: ring around the axis. Prismatic: double arrow along
 * the axis. Fixed: small cube. Drawn on top of meshes so it is always visible.
 */
export const JointMarker = memo(function JointMarker({
  joint,
  selected,
  onSelect,
}: {
  joint: RobotJoint;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const color = selected ? '#60A5FA' : JOINT_COLORS[joint.type];
  const axisRotation = useMemo(() => {
    const q = new Quaternion().setFromUnitVectors(UP, new Vector3(...joint.axis).normalize());
    return q;
  }, [joint.axis]);
  const size = selected ? 1.25 : 1;

  const click = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    if (event.delta > 3) return;
    onSelect(joint.id);
  };

  const material = <meshBasicMaterial color={color} depthTest={false} transparent opacity={0.95} />;

  return (
    <group position={joint.origin.position} rotation={joint.origin.rotation} renderOrder={10} userData={{ jointId: joint.id }}>
      <group quaternion={axisRotation} scale={size}>
        <mesh onClick={click} renderOrder={10}>
          <sphereGeometry args={[0.014, 16, 12]} />
          {material}
        </mesh>
        {joint.type !== 'fixed' && (
          <mesh position={[0, 0.045, 0]} renderOrder={10} onClick={click}>
            <cylinderGeometry args={[0.003, 0.003, 0.09, 8]} />
            {material}
          </mesh>
        )}
        {joint.type === 'revolute' && (
          <>
            <mesh rotation={[Math.PI / 2, 0, 0]} renderOrder={10} onClick={click}>
              <torusGeometry args={[0.035, 0.0035, 8, 40]} />
              {material}
            </mesh>
            <mesh position={[0, 0.095, 0]} renderOrder={10}>
              <coneGeometry args={[0.009, 0.02, 12]} />
              {material}
            </mesh>
          </>
        )}
        {joint.type === 'prismatic' && (
          <>
            <mesh position={[0, 0.095, 0]} renderOrder={10}>
              <coneGeometry args={[0.009, 0.02, 12]} />
              {material}
            </mesh>
            <mesh position={[0, -0.045, 0]} renderOrder={10} onClick={click}>
              <cylinderGeometry args={[0.003, 0.003, 0.09, 8]} />
              {material}
            </mesh>
            <mesh position={[0, -0.095, 0]} rotation={[Math.PI, 0, 0]} renderOrder={10}>
              <coneGeometry args={[0.009, 0.02, 12]} />
              {material}
            </mesh>
          </>
        )}
        {joint.type === 'fixed' && (
          <mesh renderOrder={10} onClick={click}>
            <boxGeometry args={[0.03, 0.03, 0.03]} />
            <meshBasicMaterial color={color} depthTest={false} transparent opacity={0.5} wireframe />
          </mesh>
        )}
      </group>
    </group>
  );
});
