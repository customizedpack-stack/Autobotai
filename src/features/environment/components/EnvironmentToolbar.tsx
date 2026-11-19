import { useState } from 'react';
import { FlaskConical, Plus, RotateCcw, Save, Square } from 'lucide-react';
import { Button } from '../../../components/common/Button';
import { cn } from '../../../utils/cn';
import { useSimulationStore } from '../../physics/simulation/simulationStore';
import { stopSimulation } from '../../physics/simulation/simulationManager';
import { ENVIRONMENT_LIBRARY } from '../config/environmentConfig';
import { findTemplate } from '../config/templates';
import { testEnvironment } from '../environmentSession';
import { addObject, resetToTemplate, saveEnvironment, useEnvironmentStore } from '../store/environmentStore';

/**
 * Edit Mode toolbar above the viewport: name, add object, save, test, stop, reset.
 * It sizes itself to its own column (a container query), not to the window: with the side
 * panels open the column is much narrower than the screen. Narrow columns show icons with
 * tooltips and accessible names instead of the long labels.
 */
export function EnvironmentToolbar() {
  const draft = useEnvironmentStore((s) => s.draft);
  const dirty = useEnvironmentStore((s) => s.dirty);
  const saved = useEnvironmentStore((s) => (s.draft ? Boolean(s.environments[s.draft.id]) : false));
  const simState = useSimulationStore((s) => s.state);
  const [message, setMessage] = useState<string | null>(null);
  const template = draft?.templateId ? findTemplate(draft.templateId) : undefined;
  return (
    <div className="@container relative shrink-0 border-b border-line bg-panel" data-testid="environment-toolbar">
    <div className="flex h-10 min-w-0 items-center gap-2 px-2">
      <span className="shrink-0 rounded bg-ok/15 px-2 py-0.5 text-[10.5px] font-semibold tracking-wide whitespace-nowrap text-ok uppercase" data-testid="env-mode-badge">
        Edit Mode
      </span>
      <span className="min-w-0 truncate text-[12.5px] font-semibold" data-testid="env-name">
        {draft ? draft.name : 'No environment open'}
      </span>
      {draft && (
        <span
          className={cn('flex shrink-0 items-center gap-1 text-[11px] whitespace-nowrap', dirty || !saved ? 'text-warn' : 'text-ok')}
          title={!saved ? 'Not saved yet' : dirty ? 'Unsaved changes' : 'Saved'}
          data-testid="env-save-state"
        >
          <span className="size-1.5 rounded-full bg-current" />
          <span className="hidden @3xl:inline">{!saved ? 'not saved' : dirty ? 'unsaved changes' : 'saved'}</span>
        </span>
      )}
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <label className="flex items-center gap-1 text-[11px] text-muted">
          <Plus size={12} className="hidden @2xl:block" />
          <select
            className="h-7 rounded-md border border-line bg-raised px-1.5 text-[11.5px] text-ink disabled:opacity-40"
            value=""
            disabled={!draft}
            onChange={(e) => {
              const item = ENVIRONMENT_LIBRARY[Number(e.target.value)];
              if (item) addObject(item.kind, { shape: item.shape });
            }}
            aria-label="Add object"
            data-testid="env-add-object"
          >
            <option value="">Add object…</option>
            {ENVIRONMENT_LIBRARY.map((item, i) => (
              <option key={item.label} value={i}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <Button size="sm" icon={<Save size={12} />} disabled={!draft} onClick={() => setMessage(saveEnvironment().ok ? null : 'Could not save.')} data-testid="env-save">
          Save
        </Button>
        <Button
          size="sm"
          icon={<RotateCcw size={12} />}
          disabled={!template}
          onClick={() => resetToTemplate()}
          aria-label="Reset Environment"
          title={template ? `Reset Environment: restore the objects of "${template.name}" (undoable)` : 'Reset Environment: not made from a template'}
          data-testid="env-reset"
        >
          <span className="hidden @5xl:inline">Reset Environment</span>
        </Button>
        <Button size="sm" variant="danger" icon={<Square size={11} />} disabled={simState === 'stopped'} onClick={() => stopSimulation()} aria-label="Stop Simulation" title="Stop Simulation" data-testid="env-stop-sim">
          <span className="hidden @5xl:inline">Stop Simulation</span>
        </Button>
        <Button
          size="sm"
          variant="primary"
          icon={<FlaskConical size={12} />}
          disabled={!draft}
          onClick={() => {
            void testEnvironment().then((r) => setMessage(r.ok ? null : r.errors.join(' ')));
          }}
          aria-label="Test Environment"
          title="Test Environment: save, then run the robot in this environment with the Physics engine"
          data-testid="env-test"
        >
          <span className="whitespace-nowrap">
            Test<span className="hidden @4xl:inline"> Environment</span>
          </span>
        </Button>
      </div>
    </div>
      {message && (
        <span className="absolute top-11 right-3 z-10 rounded-md bg-err/15 px-2 py-1 text-[11px] text-err" data-testid="env-toolbar-error">
          {message}
        </span>
      )}
    </div>
  );
}
