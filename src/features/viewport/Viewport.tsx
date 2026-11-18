import { useCallback, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { GizmoHelper, GizmoViewport, Grid, OrbitControls } from '@react-three/drei';
import { useSceneStore } from '../../stores/sceneStore';
import { useSelectionStore } from '../../stores/selectionStore';
import { useViewportStore } from '../../stores/viewportStore';
import { CameraRig } from './CameraRig';
import { SceneAxes } from './SceneAxes';
import { SceneObjectMesh } from './SceneObjectMesh';
import { isWebGLAvailable } from './webgl';

function SceneObjects() {
  const objects = useSceneStore((s) => s.objects);
  const selectedId = useSelectionStore((s) => s.selectedId);
  const hoveredId = useSelectionStore((s) => s.hoveredId);
  const select = useSelectionStore((s) => s.select);
  const hover = useSelectionStore((s) => s.hover);
  const shadows = useViewportStore((s) => s.showShadows);
  return (
    <>
      {objects.map((object) => (
        <SceneObjectMesh
          key={object.id}
          object={object}
          selected={object.id === selectedId}
          hovered={object.id === hoveredId}
          shadows={shadows}
          onSelect={select}
          onHover={hover}
        />
      ))}
    </>
  );
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
 * contains no editor UI, so it can be reused by the Builder, Code Studio and
 * Simulation Studio. In Phase 5 object poses come from the physics engine
 * through the Sim State Stream (C4) instead of the scene store.
 */
export function Viewport() {
  const showGrid = useViewportStore((s) => s.showGrid);
  const showAxes = useViewportStore((s) => s.showAxes);
  const shadows = useViewportStore((s) => s.showShadows);
  const markCustomView = useViewportStore((s) => s.markCustomView);
  const select = useSelectionStore((s) => s.select);
  const animating = useRef(false);

  const onUserOrbit = useCallback(() => {
    if (!animating.current) markCustomView();
  }, [markCustomView]);

  if (!isWebGLAvailable()) return <WebGLUnavailable />;

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [1.3, 1.0, 1.3], fov: 45, near: 0.01, far: 200 }}
      onPointerMissed={() => select(null)}
      gl={{ antialias: true, preserveDrawingBuffer: true }}
      data-testid="viewport-canvas"
      aria-label="3D viewport"
    >
      <color attach="background" args={['#0d0f13']} />
      <fog attach="fog" args={['#0d0f13', 12, 40]} />
      <Lights shadows={shadows} />

      {shadows && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.0005, 0]} receiveShadow>
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

      <SceneObjects />

      <OrbitControls makeDefault enableDamping dampingFactor={0.12} minDistance={0.15} maxDistance={60} />
      <CameraRig animationRef={animating} onUserMove={onUserOrbit} />

      <GizmoHelper alignment="bottom-right" margin={[64, 64]}>
        <GizmoViewport axisColors={['#EF4444', '#22C55E', '#3B82F6']} labelColor="#0d0f13" />
      </GizmoHelper>
    </Canvas>
  );
}
