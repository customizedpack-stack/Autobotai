import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Pause, Play, Plus } from 'lucide-react';
import { Badge } from '../../../components/common/Badge';
import { Button } from '../../../components/common/Button';
import { useRobotStateStore } from '../../../stores/robotStateStore';
import { useSceneStore } from '../../../stores/sceneStore';
import { CAMERA_RESOLUTIONS, type CameraResolution, type CameraSensorConfig } from '../../../types/sensor';
import { RAD_TO_DEG } from '../../../utils/math';
import { robotModel } from '../../robot-model/robotModelConnector';
import { aspectOf, verticalFov } from '../cameraMath';
import { watch } from '../cameraManager';
import { useCameraStore } from '../cameraStore';

const TONE = { live: 'ok', idle: 'neutral', disabled: 'neutral', error: 'err' } as const;

/**
 * Camera Monitor (bottom panel, Phase 8): pick a camera, watch its live image, pause it,
 * change its resolution, and see its status, field of view and frame rate. While this tab
 * is closed or the feed is paused, the camera is not rendered for the monitor at all.
 */
export function CameraMonitor() {
  const sensors = useSceneStore((s) => s.sensors);
  const cameras = useMemo(() => sensors.filter((s): s is CameraSensorConfig => s.type === 'camera'), [sensors]);
  const selectedId = useCameraStore((s) => s.selectedId);
  const paused = useCameraStore((s) => s.paused);
  const select = useCameraStore((s) => s.select);
  const setPaused = useCameraStore((s) => s.setPaused);
  const status = useCameraStore((s) => (selectedId ? s.cameras[selectedId] : undefined));
  const mode = useRobotStateStore((s) => s.mode);
  const camera = cameras.find((c) => c.id === selectedId) ?? cameras[0];
  const canvas = useRef<HTMLCanvasElement>(null);
  const [frames, setFrames] = useState(0);
  const [message, setMessage] = useState<string | null>(null);

  // Keep the selection valid when cameras are added or removed.
  useEffect(() => {
    if (camera?.id !== selectedId) select(camera?.id ?? null);
  }, [camera?.id, selectedId, select]);

  // Draw frames straight onto the canvas (no React state per frame).
  useEffect(() => {
    if (!camera || paused || !camera.enabled) return;
    let shown = 0;
    let lastCount = 0;
    const stop = watch(camera.id, (image) => {
      const c = canvas.current;
      const ctx = c?.getContext('2d');
      if (!c || !ctx) return;
      if (c.width !== image.width || c.height !== image.height) {
        c.width = image.width;
        c.height = image.height;
      }
      ctx.putImageData(new ImageData(image.data, image.width, image.height), 0, 0);
      shown += 1;
      c.dataset.frames = String(shown);
      c.dataset.source = image.source;
    });
    // The frame counter in the UI updates twice a second, not per frame.
    const timer = setInterval(() => {
      if (shown !== lastCount) {
        lastCount = shown;
        setFrames(shown);
      }
    }, 500);
    return () => {
      stop();
      clearInterval(timer);
    };
  }, [camera, paused]);

  if (cameras.length === 0) {
    return (
      <div className="flex h-full flex-col items-start gap-2 overflow-auto p-3" data-testid="camera-monitor" data-empty="true">
        <p className="flex items-center gap-1.5 text-xs text-muted" data-testid="camera-empty">
          <Camera size={13} /> This robot has no camera. Add one in Build Mode (Inspector → Sensors → Camera): a Camera part is placed at the front of the robot, looking forward.
        </p>
        {mode === 'build' && (
          <Button size="sm" icon={<Plus size={12} />} onClick={() => setMessage(robotModel.addCamera().ok ? null : 'Could not add a camera.')} data-testid="camera-add">
            Add camera
          </Button>
        )}
        {message && <p className="text-[11px] text-err">{message}</p>}
      </div>
    );
  }

  const [width, height] = CAMERA_RESOLUTIONS[camera!.resolution];
  const vFov = verticalFov(camera!.hFov, aspectOf(camera!.resolution)) * RAD_TO_DEG;
  const state = !camera!.enabled ? 'disabled' : paused ? 'paused' : (status?.status ?? 'idle');
  return (
    <div className="flex h-full flex-col gap-3 overflow-auto p-2 sm:flex-row" data-testid="camera-monitor" data-camera={camera!.id} data-state={state}>
      {/* The image scales to fit the panel (object-fit: contain), so the whole view is always visible. */}
      <div className="flex min-h-[120px] min-w-0 flex-1 items-center justify-center rounded-md bg-black/40 p-1">
        {camera!.enabled ? (
          <canvas
            ref={canvas}
            width={width}
            height={height}
            className="h-full max-h-[480px] w-full max-w-[640px] object-contain [image-rendering:pixelated]"
            aria-label={`Live image of ${camera!.name}`}
            data-testid="camera-feed"
            data-frames="0"
          />
        ) : (
          <p className="p-4 text-xs text-muted" data-testid="camera-disabled">
            This camera is disabled. Enable it in Build Mode (Inspector → Sensors).
          </p>
        )}
      </div>
      <div className="w-full shrink-0 space-y-2 text-[11px] sm:w-56 sm:overflow-auto">
        <label className="flex items-center justify-between gap-2">
          <span className="text-muted">Camera</span>
          <select className="h-6 min-w-0 flex-1 rounded-md border border-line bg-raised px-1.5 text-[11px] text-ink" value={camera!.id} onChange={(e) => select(e.target.value)} data-testid="camera-select">
            {cameras.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.id})
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center justify-between gap-2">
          <span className="text-muted">Resolution</span>
          <select
            className="h-6 rounded-md border border-line bg-raised px-1.5 text-[11px] text-ink"
            value={camera!.resolution}
            onChange={(e) => robotModel.updateSensor(camera!.id, { resolution: e.target.value as CameraResolution })}
            data-testid="camera-resolution"
          >
            {(Object.keys(CAMERA_RESOLUTIONS) as CameraResolution[]).map((r) => (
              <option key={r} value={r}>
                {r.replace('x', ' × ')}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-2">
          <Badge tone={state === 'paused' ? 'warn' : TONE[state as keyof typeof TONE]}>
            <span data-testid="camera-status">{state}</span>
          </Badge>
          <Button size="sm" variant="ghost" icon={paused ? <Play size={11} /> : <Pause size={11} />} onClick={() => setPaused(!paused)} disabled={!camera!.enabled} data-testid="camera-pause">
            {paused ? 'Resume' : 'Pause'}
          </Button>
        </div>
        <dl className="grid grid-cols-2 gap-x-2 gap-y-0.5 font-mono text-[10.5px]" data-testid="camera-info">
          <dt className="text-faint">FOV h / v</dt>
          <dd className="text-right" data-testid="camera-fov">
            {(camera!.hFov * RAD_TO_DEG).toFixed(0)}° / {vFov.toFixed(0)}°
          </dd>
          <dt className="text-faint">Resolution</dt>
          <dd className="text-right" data-testid="camera-size">
            {width} × {height}
          </dd>
          <dt className="text-faint">Frame rate</dt>
          <dd className="text-right" data-testid="camera-fps">
            {state === 'live' ? `${(status?.fps ?? 0).toFixed(1)} / ${camera!.rateHz} Hz` : `— / ${camera!.rateHz} Hz`}
          </dd>
          <dt className="text-faint">Frames shown</dt>
          <dd className="text-right" data-testid="camera-frames">
            {frames}
          </dd>
          <dt className="text-faint">Clipping</dt>
          <dd className="text-right">
            {camera!.near} … {camera!.far} m
          </dd>
        </dl>
        {status?.error && state !== 'disabled' && (
          <p className="rounded-md bg-err/10 p-1.5 text-err" data-testid="camera-error">
            {status.error}
          </p>
        )}
        <p className="text-[10.5px] leading-relaxed text-faint">Simulated image only (no object recognition). The camera follows the robot in the Kinematic and Physics engines and shows the design pose in Build Mode.</p>
      </div>
    </div>
  );
}
