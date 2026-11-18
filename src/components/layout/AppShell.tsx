import { Outlet, NavLink } from 'react-router-dom';
import { LogoMark } from '../common/Logo';
import { AppSidebar } from './AppSidebar';

/** Layout for dashboard-style pages (everything except the full-screen workspace). */
export function AppShell() {
  return (
    <div className="flex h-full">
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 items-center gap-3 border-b border-line bg-panel px-4 md:hidden">
          <LogoMark size={24} />
          <nav className="flex gap-3 text-xs text-muted" aria-label="Mobile">
            <NavLink to="/">Dashboard</NavLink>
            <NavLink to="/projects">Projects</NavLink>
            <NavLink to="/new">New Robot</NavLink>
          </nav>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
