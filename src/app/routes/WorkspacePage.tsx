import { useCallback, useEffect, useState } from 'react';
import { useBlocker, useNavigate, useParams } from 'react-router-dom';
import { Monitor, X } from 'lucide-react';
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
import { COMPACT_WORKSPACE_QUERY, useMediaQuery } from '../../hooks/useMediaQuery';
import { useWorkspaceShortcuts } from '../../hooks/useWorkspaceShortcuts';
import { useProjectStore } from '../../stores/projectStore';
import { useSceneStore } from '../../stores/sceneStore';
import { useSelectionStore } from '../../stores/selectionStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useViewportStore } from '../../stores/viewportStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { log } from '../../utils/logger';
import { NotFoundPage } from './NotFoundPage';

/** Slim, dismissible hint on narrow screens. It never blocks the workspace. */
function SmallScreenBanner() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-line bg-panel-2 px-3 py-1.5 text-[11px] text-muted md:hidden" data-testid="small-screen-banner">
      <Monitor size={13} className="shrink-0" />
      <span className="flex-1">The workspace works best on a desktop screen. Panels open as drawers here.</span>
      <button type="button" aria-label="Dismiss" onClick={() => setDismissed(true)} className="text-faint hover:text-ink">
        <X size={13} />
      </button>
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
  const compact = useMediaQuery(COMPACT_WORKSPACE_QUERY);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // One blocker guards every route change: in-app links, the back arrow and
  // browser Back / Forward. Tab close and reload are covered by beforeunload.
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      currentLocation.pathname !== nextLocation.pathname &&
      useSceneStore.getState().dirty &&
      useSettingsStore.getState().confirmUnsavedOnLeave,
  );

  // Load the project into the editable scene once per project id.
  useEffect(() => {
    if (!project || useSceneStore.getState().projectId === project.id) return;
    useSceneStore.getState().loadProject(project);
    useSelectionStore.getState().clear();
    useViewportStore.getState().requestView('perspective');
    log.info('project', `Opened "${project.name}" with ${project.objects.length} objects and ${project.joints.length} joints.`);
  }, [project]);

  // Close the scene when leaving the workspace.
  useEffect(
    () => () => {
      useSceneStore.getState().closeProject();
      useSelectionStore.getState().clear();
      document.body.style.cursor = '';
    },
    [],
  );

  // Browser-level warning for closing or reloading the tab with unsaved changes.
  useEffect(() => {
    if (!dirty || !confirmOnLeave) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty, confirmOnLeave]);

  // Side panels start closed when the workspace becomes compact, so the viewport stays usable.
  useEffect(() => {
    if (!compact) return;
    const { setPanelCollapsed } = useWorkspaceStore.getState();
    setPanelCollapsed('left', true);
    setPanelCollapsed('right', true);
  }, [compact]);

  const ready = Boolean(project) && loadedId === projectId;
  useWorkspaceShortcuts(ready);

  const exit = useCallback(() => navigate('/'), [navigate]);

  if (!project) {
    return <NotFoundPage message="This project was not found in this browser. Local drafts are stored per browser." />;
  }

  return (
    <div className="flex h-full flex-col bg-app" data-testid="workspace" data-compact={compact}>
      <WorkspaceTopBar onExit={exit} onOpenSettings={() => setSettingsOpen(true)} />
      <SmallScreenBanner />
      <div className="relative flex min-h-0 flex-1" data-testid="workspace-main">
        <LeftPanel overlay={compact} />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1 bg-viewport" data-testid="viewport">
            {ready && <Viewport />}
            <ViewportToolbar />
          </div>
          <BottomPanel />
        </div>
        <RightPanel overlay={compact} />
      </div>
      <StatusBar />

      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <Modal
        open={blocker.state === 'blocked'}
        title="Unsaved changes"
        onClose={() => blocker.reset?.()}
        footer={
          <>
            <Button onClick={() => blocker.reset?.()}>Cancel</Button>
            <Button variant="danger" onClick={() => blocker.proceed?.()}>
              Discard changes and leave
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                if (saveCurrentProject()) blocker.proceed?.();
              }}
            >
              Save and leave
            </Button>
          </>
        }
      >
        <p className="text-[13px] text-muted">You have changes that are not saved to your local draft yet.</p>
      </Modal>
    </div>
  );
}
