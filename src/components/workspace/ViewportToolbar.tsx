import type React from 'react';
import { Axis3d, Crosshair, Globe, Grid3x3, Link2, Magnet, Maximize, MousePointer2, Move3d, Rotate3d, Scaling, SunDim } from 'lucide-react';
import { CAMERA_VIEWS } from '../../features/viewport/cameraPresets';
import { useRobotStateStore } from '../../stores/robotStateStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useViewportStore, type TransformMode } from '../../stores/viewportStore';
import { cn } from '../../utils/cn';
import { IconButton } from '../common/Button';

/** Overlay controls for the 3D viewport. Kept outside the Three.js scene. */
export function ViewportToolbar() {
  const activeView = useViewportStore((s) => s.activeView);
  const requestView = useViewportStore((s) => s.requestView);
  const requestFrame = useViewportStore((s) => s.requestFrame);
  const showGrid = useViewportStore((s) => s.showGrid);
  const showAxes = useViewportStore((s) => s.showAxes);
  const showShadows = useViewportStore((s) => s.showShadows);
  const toggleGrid = useViewportStore((s) => s.toggleGrid);
  const toggleAxes = useViewportStore((s) => s.toggleAxes);
  const toggleShadows = useViewportStore((s) => s.toggleShadows);
  const showHints = useSettingsStore((s) => s.showShortcutHints);
  const showJoints = useViewportStore((s) => s.showJoints);
  const toggleJoints = useViewportStore((s) => s.toggleJoints);
  const mode = useViewportStore((s) => s.transformMode);
  const setMode = useViewportStore((s) => s.setTransformMode);
  const space = useViewportStore((s) => s.transformSpace);
  const toggleSpace = useViewportStore((s) => s.toggleTransformSpace);
  const snap = useViewportStore((s) => s.snap);
  const toggleSnap = useViewportStore((s) => s.toggleSnap);
  const control = useRobotStateStore((s) => s.mode === 'control');
  const followRobot = useViewportStore((s) => s.followRobot);
  const toggleFollowRobot = useViewportStore((s) => s.toggleFollowRobot);

  const modes: { id: TransformMode; label: string; key: string; icon: React.ReactNode }[] = [
    { id: 'select', label: 'Select', key: 'Q', icon: <MousePointer2 size={13} /> },
    { id: 'translate', label: 'Move', key: 'W', icon: <Move3d size={13} /> },
    { id: 'rotate', label: 'Rotate', key: 'E', icon: <Rotate3d size={13} /> },
    { id: 'scale', label: 'Scale', key: 'R', icon: <Scaling size={13} /> },
  ];

  return (
    <>
      <div className="pointer-events-none absolute inset-x-2 top-2 z-10 flex items-start justify-between gap-2">
        <div className="pointer-events-auto flex flex-wrap items-center gap-1 rounded-md border border-line bg-panel/95 p-0.5 shadow-lg shadow-black/30 backdrop-blur">
          {!control && (
          <>
          <div className="flex" role="group" aria-label="Transform tools" data-testid="transform-tools">
            {modes.map((m) => (
              <IconButton key={m.id} label={`${m.label} tool`} shortcut={m.key} active={mode === m.id} onClick={() => setMode(m.id)} className="h-6 w-6">
                {m.icon}
              </IconButton>
            ))}
            <IconButton label={space === 'world' ? 'Gizmo axes: world (click for local)' : 'Gizmo axes: local (click for world)'} active={space === 'local'} onClick={toggleSpace} className="h-6 w-6">
              <Globe size={13} />
            </IconButton>
            <IconButton label="Snap (1 cm, 15°, 0.1×)" shortcut="S" active={snap} onClick={toggleSnap} className="h-6 w-6">
              <Magnet size={13} />
            </IconButton>
          </div>
          <div className="mx-0.5 h-4 w-px bg-line" />
          </>
          )}
          <div className="flex" role="group" aria-label="Camera views" data-testid="view-buttons">
            {CAMERA_VIEWS.map((view) => (
              <button
                key={view.id}
                type="button"
                onClick={() => requestView(view.id)}
                aria-pressed={activeView === view.id}
                title={`${view.label} view (${view.shortcut})`}
                className={cn(
                  'h-6 rounded px-2 text-[11px] font-medium transition-colors',
                  activeView === view.id ? 'bg-accent text-white' : 'text-muted hover:bg-raised hover:text-ink',
                )}
              >
                {view.label}
              </button>
            ))}
          </div>
          <div className="mx-0.5 h-4 w-px bg-line" />
          <IconButton label="Frame all objects" shortcut="F" onClick={requestFrame} className="h-6 w-6">
            <Maximize size={13} />
          </IconButton>
          <IconButton label="Ground grid" active={showGrid} onClick={toggleGrid} className="h-6 w-6">
            <Grid3x3 size={13} />
          </IconButton>
          <IconButton label="Coordinate axes" active={showAxes} onClick={toggleAxes} className="h-6 w-6">
            <Axis3d size={13} />
          </IconButton>
          <IconButton label="Shadows" active={showShadows} onClick={toggleShadows} className="h-6 w-6">
            <SunDim size={13} />
          </IconButton>
          <IconButton label="Joint markers" active={showJoints} onClick={toggleJoints} className="h-6 w-6">
            <Link2 size={13} />
          </IconButton>
          {control && (
            <IconButton label="Camera follows the robot" active={followRobot} onClick={toggleFollowRobot} className="h-6 w-6">
              <Crosshair size={13} />
            </IconButton>
          )}
        </div>
        <div className="hidden shrink-0 rounded-md border border-line bg-panel/90 px-2 py-1 font-mono text-[10.5px] text-muted md:block" data-testid="active-view">
          {activeView === 'custom' ? 'Custom view' : `${CAMERA_VIEWS.find((v) => v.id === activeView)?.label} view`} · Y-up · meters
        </div>
      </div>
      {control && (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center px-2"
          data-testid="kinematic-banner"
        >
          <span className="rounded-md border border-warn/40 bg-panel/90 px-2.5 py-1 text-[11px] font-medium text-warn">
            Kinematic Simulation — Physics Engine Integration Coming in Phase 5
          </span>
        </div>
      )}
      {showHints && !control && (
        <div className="pointer-events-none absolute bottom-2 left-2 hidden rounded-md bg-panel/80 px-2 py-1 text-[10.5px] text-faint md:block">
          Left-drag orbit · Right-drag pan · Wheel zoom · Click to select · W/E/R move, rotate, scale
        </div>
      )}
    </>
  );
}
