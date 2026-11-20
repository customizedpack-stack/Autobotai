import { lazy, Suspense, type JSX } from 'react';
import { createBrowserRouter, createMemoryRouter, RouterProvider, type RouteObject } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { AppProviders } from './providers/AppProviders';
import { DashboardPage } from './routes/DashboardPage';
import { NewRobotPage } from './routes/NewRobotPage';
import { NotFoundPage } from './routes/NotFoundPage';
import { ProjectsPage } from './routes/ProjectsPage';
import { RouteError } from './routes/RouteError';

// The workspace pulls in Three.js; load it only when it is opened.
const WorkspacePage = lazy(() => import('./routes/WorkspacePage'));
// Phase 11 learning pages load on demand.
const LearnPage = lazy(() => import('../features/learning/pages/LearnPage'));
const LibraryPage = lazy(() => import('../features/learning/pages/LibraryPage'));
const ProjectDetailPage = lazy(() => import('../features/learning/pages/ProjectDetailPage'));
const PurposeBuilderPage = lazy(() => import('../features/learning/pages/PurposeBuilderPage'));

function PageLoading() {
  return <div className="p-8 text-xs text-muted">Loading…</div>;
}
const page = (element: JSX.Element) => <Suspense fallback={<PageLoading />}>{element}</Suspense>;

function WorkspaceLoading() {
  return <div className="flex h-full items-center justify-center bg-app text-xs text-muted">Loading workspace…</div>;
}

const routes: RouteObject[] = [
  {
    element: <AppShell />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'projects', element: <ProjectsPage /> },
      { path: 'new', element: <NewRobotPage /> },
      { path: 'learn', element: page(<LearnPage />) },
      { path: 'library', element: page(<LibraryPage />) },
      { path: 'library/:slug', element: page(<ProjectDetailPage />) },
      { path: 'builder', element: page(<PurposeBuilderPage />) },
    ],
  },
  {
    path: 'workspace/:projectId',
    errorElement: <RouteError />,
    element: (
      <Suspense fallback={<WorkspaceLoading />}>
        <WorkspacePage />
      </Suspense>
    ),
  },
  { path: '*', element: <NotFoundPage /> },
];

/**
 * A data router is required for navigation blocking (`useBlocker`), which
 * protects unsaved work against in-app links and browser Back / Forward.
 * Demo builds keep the route in memory so they work inside sandboxed hosts
 * that do not allow URL path or hash changes.
 */
const router = import.meta.env.VITE_DEMO === 'true' ? createMemoryRouter(routes) : createBrowserRouter(routes);

export function App() {
  return (
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  );
}
