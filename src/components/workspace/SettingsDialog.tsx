import type { ReactNode } from 'react';
import { useSettingsStore } from '../../stores/settingsStore';
import { cn } from '../../utils/cn';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';

function SettingRow({ label, hint, children }: { label: string; hint: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line-soft py-2.5 last:border-0">
      <div>
        <div className="text-[13px]">{label}</div>
        <div className="text-[11px] text-faint">{hint}</div>
      </div>
      {children}
    </div>
  );
}

function Segmented<T extends string | number>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="flex rounded-md border border-line bg-app p-0.5" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn('h-6 rounded px-2 text-[11px]', value === o.value ? 'bg-raised text-ink' : 'text-muted hover:text-ink')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn('relative h-5 w-9 rounded-full transition-colors', checked ? 'bg-accent' : 'bg-line')}
    >
      <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all', checked ? 'left-[18px]' : 'left-0.5')} />
    </button>
  );
}

export function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useSettingsStore();
  return (
    <Modal
      open={open}
      title="Editor settings"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={s.reset}>
            Reset defaults
          </Button>
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </>
      }
    >
      <SettingRow label="Rotation units" hint="How rotation is shown in the inspector.">
        <Segmented label="Rotation units" value={s.rotationUnit} onChange={s.setRotationUnit} options={[{ value: 'deg', label: 'Degrees' }, { value: 'rad', label: 'Radians' }]} />
      </SettingRow>
      <SettingRow label="Position nudge step" hint="Arrow keys in position fields. Shift = ×10.">
        <Segmented
          label="Position nudge step"
          value={s.positionStep}
          onChange={s.setPositionStep}
          options={[
            { value: 0.001, label: '1 mm' },
            { value: 0.01, label: '1 cm' },
            { value: 0.1, label: '10 cm' },
          ]}
        />
      </SettingRow>
      <SettingRow label="Warn about unsaved changes" hint="Ask before leaving the workspace.">
        <Toggle label="Warn about unsaved changes" checked={s.confirmUnsavedOnLeave} onChange={s.setConfirmUnsavedOnLeave} />
      </SettingRow>
      <SettingRow label="Viewport hints" hint="Show mouse control hints in the viewport.">
        <Toggle label="Viewport hints" checked={s.showShortcutHints} onChange={s.setShowShortcutHints} />
      </SettingRow>
      <div className="mt-3 rounded-md bg-app p-2.5 text-[11px] leading-relaxed text-faint">
        Shortcuts: Ctrl+S save · Ctrl+Z undo · Ctrl+Shift+Z redo · Ctrl+D duplicate · Del delete part or joint · Esc deselect · Q select · W move · E rotate · R scale · S snap · 1–6 camera views · F frame all
      </div>
    </Modal>
  );
}
