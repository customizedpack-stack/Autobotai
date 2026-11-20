import { X } from 'lucide-react';
import { IconButton } from '../../../components/common/Button';
import { cn } from '../../../utils/cn';
import { findTutorial } from '../catalog/tutorials';
import { useLearningSession } from '../store/learningSession';
import { InspectPanel } from './InspectPanel';
import { TutorialPanel } from './TutorialPanel';

/** The workspace side panel for Phase 11: the tutorial (Learn → Do → Verify) or Reverse Engineering inspection. */
export default function LearningPanel({ overlay }: { overlay: boolean }) {
  const { projectId, tutorialId, inspecting, panelOpen } = useLearningSession();
  const tutorial = tutorialId ? findTutorial(tutorialId) : undefined;
  if (!projectId || !panelOpen || (!tutorial && !inspecting)) return null;
  return (
    <aside
      className={cn(
        'relative z-20 flex w-[340px] max-w-[92vw] shrink-0 flex-col border-l border-line bg-panel',
        overlay && 'absolute top-0 right-0 bottom-0 z-30 shadow-2xl',
      )}
      aria-label={inspecting ? 'Reverse Engineering' : 'Tutorial'}
      data-testid="learning-panel"
    >
      <div className="absolute top-1.5 right-1.5 z-10">
        <IconButton label="Hide panel" onClick={() => useLearningSession.getState().setPanelOpen(false)}>
          <X size={14} />
        </IconButton>
      </div>
      {inspecting ? <InspectPanel projectId={projectId} /> : tutorial && <TutorialPanel tutorial={tutorial} projectId={projectId} />}
    </aside>
  );
}
