import { memo } from 'react';
import { Edges } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import type { PrimitiveGeometry, SceneObject } from '../../types/scene';

function Geometry({ geometry }: { geometry: PrimitiveGeometry }) {
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

interface SceneObjectMeshProps {
  object: SceneObject;
  selected: boolean;
  hovered: boolean;
  shadows: boolean;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}

/** Renders one placeholder primitive. Purely visual: no physics in Phase 1. */
export const SceneObjectMesh = memo(function SceneObjectMesh({
  object,
  selected,
  hovered,
  shadows,
  onSelect,
  onHover,
}: SceneObjectMeshProps) {
  if (!object.visible) return null;
  const { position, rotation, scale } = object.transform;

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    // Ignore clicks that were really camera drags.
    if (event.delta > 3) return;
    onSelect(object.id);
  };

  return (
    <mesh
      name={object.name}
      userData={{ objectId: object.id }}
      position={position}
      rotation={rotation}
      scale={scale}
      castShadow={shadows}
      receiveShadow={shadows}
      onClick={handleClick}
      onPointerOver={(event) => {
        event.stopPropagation();
        onHover(object.id);
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        onHover(null);
        document.body.style.cursor = '';
      }}
    >
      <Geometry geometry={object.geometry} />
      <meshStandardMaterial
        color={object.color}
        roughness={0.5}
        metalness={0.1}
        emissive={selected ? '#3B82F6' : '#000000'}
        emissiveIntensity={selected ? 0.18 : 0}
      />
      {(selected || hovered) && (
        <Edges threshold={20} color={selected ? '#60A5FA' : '#94A3B8'} lineWidth={selected ? 2 : 1} />
      )}
    </mesh>
  );
});
