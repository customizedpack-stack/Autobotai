import { Check } from 'lucide-react';
import { useSettingsStore } from '../../../stores/settingsStore';
import { cn } from '../../../utils/cn';
import { EXPERIENCE_MODES } from '../model/types';

/** First-visit choice of experience mode. It can be changed later in the sidebar; no project data changes. */
export function ExperienceChooser() {
  const mode = useSettingsStore((s) => s.experienceMode);
  const setMode = useSettingsStore((s) => s.setExperienceMode);
  return (
    <section className="mt-6 rounded-lg border border-accent/40 bg-accent-soft p-4" aria-labelledby="experience-heading" data-testid="experience-chooser">
      <h2 id="experience-heading" className="text-sm font-semibold">
        How do you want to work?
      </h2>
      <p className="mt-0.5 text-xs text-muted">You can change this any time in the sidebar. Your projects are never changed by it.</p>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Experience mode">
        {EXPERIENCE_MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={mode === m.id}
            onClick={() => setMode(m.id)}
            data-testid={`choose-${m.id}`}
            className={cn('rounded-md border p-3 text-left transition-colors', mode === m.id ? 'border-accent bg-panel' : 'border-line bg-panel/60 hover:border-[#3d4553]')}
          >
            <span className="flex items-center justify-between text-[13px] font-semibold">
              {m.label} Mode {mode === m.id && <Check size={13} className="text-accent" aria-hidden />}
            </span>
            <span className="mt-1 block text-xs text-muted">{m.description}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
