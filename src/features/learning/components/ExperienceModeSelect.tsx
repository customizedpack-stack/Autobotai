import { useId } from 'react';
import { useSettingsStore, type ExperienceMode } from '../../../stores/settingsStore';
import { EXPERIENCE_MODES } from '../model/types';

/** Switch the experience mode. Only the presentation changes: projects and the simulation are untouched. */
export function ExperienceModeSelect({ testId, compact = false }: { testId: string; compact?: boolean }) {
  const id = useId();
  const mode = useSettingsStore((s) => s.experienceMode);
  const setMode = useSettingsStore((s) => s.setExperienceMode);
  return (
    <div className={compact ? 'flex items-center gap-1.5' : 'flex flex-col gap-1'}>
      <label htmlFor={id} className="text-[10.5px] font-semibold tracking-wider text-faint uppercase">
        Experience
      </label>
      <select
        id={id}
        value={mode}
        onChange={(e) => setMode(e.target.value as ExperienceMode)}
        className="h-7 rounded-md border border-line bg-app px-1.5 text-xs text-ink outline-none focus:border-accent"
        data-testid={testId}
        title={EXPERIENCE_MODES.find((m) => m.id === mode)?.description}
      >
        {EXPERIENCE_MODES.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </select>
    </div>
  );
}
