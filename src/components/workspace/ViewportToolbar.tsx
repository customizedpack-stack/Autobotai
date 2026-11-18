import { Axis3d, Grid3x3, Maximize, SunDim } from 'lucide-react';
import { CAMERA_VIEWS } from '../../features/viewport/cameraPresets';
import { useSettingsStore } from '../../stores/settingsStore';
import { useViewportStore } from '../../stores/viewportStore';
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

  return (
    <>
      <div className="pointer-events-none absolute inset-x-2 top-2 flex items-start justify-between gap-2">
        <div className="pointer-events-auto flex items-center gap-1 rounded-md border border-line bg-panel/95 p-0.5 shadow-lg shadow-black/30 backdrop-blur">
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
        </div>
        <div className="rounded-md border border-line bg-panel/90 px-2 py-1 font-mono text-[10.5px] text-muted" data-testid="active-view">
          {activeView === 'custom' ? 'Custom view' : `${CAMERA_VIEWS.find((v) => v.id === activeView)?.label} view`} · Y-up · meters
        </div>
      </div>
      {showHints && (
        <div className="pointer-events-none absolute bottom-2 left-2 rounded-md bg-panel/80 px-2 py-1 text-[10.5px] text-faint">
          Left-drag orbit · Right-drag pan · Wheel zoom · Click to select
        </div>
      )}
    </>
  );
}
