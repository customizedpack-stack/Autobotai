import { useState } from 'react';
import { FlaskConical, Plus, RotateCcw, Save, Square } from 'lucide-react';
import { Button } from '../../../components/common/Button';
import { useSimulationStore } from '../../physics/simulation/simulationStore';
import { stopSimulation } from '../../physics/simulation/simulationManager';
import { ENVIRONMENT_LIBRARY } from '../config/environmentConfig';
import { findTemplate } from '../config/templates';
import { testEnvironment } from '../environmentSession';
import { addObject, resetToTemplate, saveEnvironment, useEnvironmentStore } from '../store/environmentStore';

/** Edit Mode toolbar above the viewport: name, add object, save, test, stop, reset. */
export function EnvironmentToolbar() {
  const draft = useEnvironmentStore((s) => s.draft);
  const dirty = useEnvironmentStore((s) => s.dirty);
  const saved = useEnvironmentStore((s) => (s.draft ? Boolean(s.environments[s.draft.id]) : false));
  const simState = useSimulationStore((s) => s.state);
  const [message, setMessage] = useState<string | null>(null);
  const template = draft?.templateId ? findTemplate(draft.templateId) : undefined;
  return (
    <div className="flex h-10 shrink-0 items-center gap-2 border-b border-line bg-panel px-2" data-testid="environment-toolbar">
      <span className="shrink-0 rounded bg-ok/15 px-2 py-0.5 text-[10.5px] font-semibold tracking-wide whitespace-nowrap text-ok uppercase" data-testid="env-mode-badge">
        Edit Mode
      </span>
      <span className="min-w-0 truncate text-[12.5px] font-semibold" data-testid="env-name">
        {draft ? draft.name : 'No environment open'}
      </span>
      {draft && <span className={dirty || !saved ? 'text-[11px] text-warn' : 'text-[11px] text-ok'}>{!saved ? 'not saved' : dirty ? 'unsaved changes' : 'saved'}</span>}
      <div className="ml-auto flex items-center gap-1.5">
        <label className="flex items-center gap-1 text-[11px] text-muted">
          <Plus size={12} />
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
        <Button size="sm" icon={<RotateCcw size={12} />} disabled={!template} onClick={() => resetToTemplate()} title={template ? `Restore the objects of "${template.name}" (undoable)` : 'Not made from a template'} data-testid="env-reset">
          Reset Environment
        </Button>
        <Button size="sm" variant="danger" icon={<Square size={11} />} disabled={simState === 'stopped'} onClick={() => stopSimulation()} data-testid="env-stop-sim">
          Stop Simulation
        </Button>
        <Button
          size="sm"
          variant="primary"
          icon={<FlaskConical size={12} />}
          disabled={!draft}
          onClick={() => {
            void testEnvironment().then((r) => setMessage(r.ok ? null : r.errors.join(' ')));
          }}
          title="Save, then run the robot in this environment with the Physics engine"
          data-testid="env-test"
        >
          Test Environment
        </Button>
      </div>
      {message && (
        <span className="absolute top-11 right-3 z-10 rounded-md bg-err/15 px-2 py-1 text-[11px] text-err" data-testid="env-toolbar-error">
          {message}
        </span>
      )}
    </div>
  );
}
