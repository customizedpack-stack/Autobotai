import { useState } from 'react';
import { Link } from 'react-router-dom';
import { GraduationCap, Lightbulb, X } from 'lucide-react';
import { useRobotStateStore } from '../../../stores/robotStateStore';
import { useSettingsStore } from '../../../stores/settingsStore';
import { useSimulationStore } from '../../physics/simulation/simulationStore';
import { useLearningSession } from '../store/learningSession';

const HINTS: Record<string, string> = {
  build: 'Build: click a part to select it, then change it in the panel on the right. Drag new parts from the Library on the left.',
  control: 'Control: drive with W A S D or the arrow keys. Click Simulate for real physics.',
  physics: 'Simulate: real physics is on. Sensors such as the distance sensor measure now.',
  code: 'Code: write or insert a program, click Save, then Run. The robot in the 3D view follows it.',
  environment: 'Environment: add walls and boxes for your robot to test against, then Save.',
  blueprint: 'Blueprint: map the 3D parts to real parts, then read the wiring and the build guide.',
};

/** Beginner Mode only: one line of help for the current mode and a clear next action. */
export function BeginnerGuide() {
  const beginner = useSettingsStore((s) => s.experienceMode === 'beginner');
  const mode = useRobotStateStore((s) => s.mode);
  const physics = useSimulationStore((s) => s.engine === 'physics');
  const { tutorialId, panelOpen } = useLearningSession();
  const [hidden, setHidden] = useState(false);
  if (!beginner || hidden) return null;
  const hint = HINTS[mode === 'control' && physics ? 'physics' : mode] ?? '';
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-line bg-accent-soft px-3 py-1.5 text-[11.5px] text-ink" role="note" data-testid="beginner-guide">
      <Lightbulb size={13} className="shrink-0 text-accent" aria-hidden />
      <span className="min-w-0 flex-1">{hint}</span>
      {tutorialId && !panelOpen ? (
        <button type="button" onClick={() => useLearningSession.getState().setPanelOpen(true)} className="inline-flex items-center gap-1 font-medium text-accent hover:underline" data-testid="guide-resume">
          <GraduationCap size={13} aria-hidden /> Resume the tutorial
        </button>
      ) : (
        !tutorialId && (
          <Link to="/learn" className="inline-flex items-center gap-1 font-medium text-accent hover:underline">
            <GraduationCap size={13} aria-hidden /> Start a guided tutorial
          </Link>
        )
      )}
      <button type="button" aria-label="Hide tips" onClick={() => setHidden(true)} className="text-muted hover:text-ink">
        <X size={13} />
      </button>
    </div>
  );
}
