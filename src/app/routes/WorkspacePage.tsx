import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Monitor } from 'lucide-react';
import { Button } from '../../components/common/Button';
import { Modal } from '../../components/common/Modal';
import { BottomPanel } from '../../components/workspace/BottomPanel';
import { LeftPanel } from '../../components/workspace/LeftPanel';
import { RightPanel } from '../../components/workspace/RightPanel';
import { SettingsDialog } from '../../components/workspace/SettingsDialog';
import { StatusBar } from '../../components/workspace/StatusBar';
import { ViewportToolbar } from '../../components/workspace/ViewportToolbar';
import { WorkspaceTopBar } from '../../components/workspace/WorkspaceTopBar';
import { saveCurrentProject } from '../../features/projects/workspaceActions';
import { Viewport } from '../../features/viewport/Viewport';
import { useWorkspaceShortcuts } from '../../hooks/useWorkspaceShortcuts';
import { useProjectStore } from '../../stores/projectStore';
import { useSceneStore } from '../../stores/sceneStore';
import { useSelectionStore } from '../../stores/selectionStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useViewportStore } from '../../stores/viewportStore';
import { log } from '../../utils/logger';
import { NotFoundPage } from './NotFoundPage';

function SmallScreenNotice() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-app/95 p-6 text-center lg:hidden">
      <div className="max-w-xs">
        <Monitor size={22} className="mx-auto text-muted" />
        <p className="mt-3 text-sm font-semibold">Best on a larger screen</p>
        <p className="mt-1 text-xs text-muted">The robotics workspace is designed for desktop screens 1280 px wide or more.</p>
        <Button size="sm" className="mt-4" onClick={() => setDismissed(true)}>
          Continue anyway
        </Button>
      </div>
    </div>
  );
}

export default function WorkspacePage() {
  const { projectId = '' } = useParams();
  const navigate = useNavigate();
  const project = useProjectStore((s) => s.projects[projectId]);
  const loadedId = useSceneStore((s) => s.projectId);
  const dirty = useSceneStore((s) => s.dirty);
  const confirmOnLeave = useSettingsStore((s) => s.confirmUnsavedOnLeave);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);

  // Load the project into the editable scene once per project id.
  useEffect(() => {
    if (!project || useSceneStore.getState().projectId === project.id) return;
    useSceneStore.getState().loadProject(project);
    useSelectionStore.getState().select(null);
    useViewportStore.getState().requestView('perspective');
    log.info('project', `Opened "${project.name}" with ${project.objects.length} objects.`);
  }, [project]);

  // Close the scene when leaving the workspace.
  useEffect(
    () => () => {
      useSceneStore.getState().closeProject();
      useSelectionStore.getState().select(null);
      document.body.style.cursor = '';
    },
    [],
  );

  // Browser-level warning for closing the tab with unsaved changes.
  useEffect(() => {
    if (!dirty || !confirmOnLeave) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty, confirmOnLeave]);

  const ready = Boolean(project) && loadedId === projectId;
  useWorkspaceShortcuts(ready);

  const exit = useCallback(() => {
    if (useSceneStore.getState().dirty && useSettingsStore.getState().confirmUnsavedOnLeave) setLeaveOpen(true);
    else navigate('/');
  }, [navigate]);

  if (!project) {
    return <NotFoundPage message="This project was not found in this browser. Local drafts are stored per browser." />;
  }

  return (
    <div className="flex h-full flex-col bg-app" data-testid="workspace">
      <WorkspaceTopBar onExit={exit} onOpenSettings={() => setSettingsOpen(true)} />
      <div className="flex min-h-0 flex-1">
        <LeftPanel />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1 bg-viewport" data-testid="viewport">
            {ready && <Viewport />}
            <ViewportToolbar />
          </div>
          <BottomPanel />
        </div>
        <RightPanel />
      </div>
      <StatusBar />

      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <Modal
        open={leaveOpen}
        title="Unsaved changes"
        onClose={() => setLeaveOpen(false)}
        footer={
          <>
            <Button onClick={() => setLeaveOpen(false)}>Cancel</Button>
            <Button variant="danger" onClick={() => navigate('/')}>
              Leave without saving
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                if (saveCurrentProject()) navigate('/');
              }}
            >
              Save and leave
            </Button>
          </>
        }
      >
        <p className="text-[13px] text-muted">You have changes that are not saved to your local draft yet.</p>
      </Modal>
      <SmallScreenNotice />
    </div>
  );
}
