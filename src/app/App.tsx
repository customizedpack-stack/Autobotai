import { lazy, Suspense } from 'react';
import { BrowserRouter, HashRouter, Route, Routes } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { AppProviders } from './providers/AppProviders';
import { DashboardPage } from './routes/DashboardPage';
import { NewRobotPage } from './routes/NewRobotPage';
import { NotFoundPage } from './routes/NotFoundPage';
import { ProjectsPage } from './routes/ProjectsPage';

// The workspace pulls in Three.js; load it only when it is opened.
const WorkspacePage = lazy(() => import('./routes/WorkspacePage'));

// Demo builds use hash routing so they work from any static host without rewrites.
const Router = import.meta.env.VITE_DEMO === 'true' ? HashRouter : BrowserRouter;

function WorkspaceLoading() {
  return (
    <div className="flex h-full items-center justify-center bg-app text-xs text-muted">Loading workspace…</div>
  );
}

export function App() {
  return (
    <AppProviders>
      <Router>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<DashboardPage />} />
            <Route path="projects" element={<ProjectsPage />} />
            <Route path="new" element={<NewRobotPage />} />
          </Route>
          <Route
            path="workspace/:projectId"
            element={
              <Suspense fallback={<WorkspaceLoading />}>
                <WorkspacePage />
              </Suspense>
            }
          />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Router>
    </AppProviders>
  );
}
