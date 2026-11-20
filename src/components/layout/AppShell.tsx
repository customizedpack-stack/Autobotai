import { Outlet, NavLink } from 'react-router-dom';
import { LogoMark } from '../common/Logo';
import { cn } from '../../utils/cn';
import { AppSidebar } from './AppSidebar';
import { NAV } from './navigation';

/** Layout for dashboard-style pages (everything except the full-screen workspace). */
export function AppShell() {
  return (
    <div className="flex h-full">
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-panel px-3 md:hidden">
          <LogoMark size={24} />
          <nav className="flex min-w-0 gap-1 overflow-x-auto text-xs whitespace-nowrap" aria-label="Mobile">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) => cn('rounded px-2 py-1.5', isActive ? 'bg-accent-soft text-ink' : 'text-muted hover:text-ink')}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
