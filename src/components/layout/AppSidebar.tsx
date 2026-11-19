import { NavLink } from 'react-router-dom';
import { Bot, FolderKanban, GraduationCap, LayoutDashboard, Lock, Plus, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';
import { Logo } from '../common/Logo';

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
}

const NAV: readonly NavItem[] = [
  { to: '/', label: 'Dashboard', icon: <LayoutDashboard size={16} /> },
  { to: '/projects', label: 'My Projects', icon: <FolderKanban size={16} /> },
  { to: '/new', label: 'New Robot', icon: <Plus size={16} /> },
];

/** Modules from the master plan that are not built yet. Shown as roadmap, not as links. */
const UPCOMING: readonly { label: string; phase: string; icon: ReactNode }[] = [
  { label: 'AI Assistant', phase: 'Phase J', icon: <Bot size={16} /> },
  { label: 'Learning Center', phase: 'Later', icon: <GraduationCap size={16} /> },
  { label: 'Community', phase: 'Phase 8', icon: <Users size={16} /> },
];

export function AppSidebar() {
  return (
    <aside className="hidden w-56 shrink-0 flex-col border-r border-line bg-panel md:flex">
      <div className="flex h-14 items-center border-b border-line px-4">
        <Logo />
      </div>
      <nav className="flex flex-col gap-0.5 p-2" aria-label="Main">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              cn(
                'flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium transition-colors',
                isActive ? 'bg-accent-soft text-ink' : 'text-muted hover:bg-raised hover:text-ink',
              )
            }
          >
            {item.icon}
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="mt-2 px-4 text-[10.5px] font-semibold tracking-wider text-faint uppercase">Coming in later phases</div>
      <ul className="flex flex-col gap-0.5 p-2" aria-label="Upcoming modules">
        {UPCOMING.map((item) => (
          <li
            key={item.label}
            className="flex h-8 cursor-default items-center gap-2.5 rounded-md px-2.5 text-[13px] text-faint"
            title={`${item.label} arrives in ${item.phase}`}
          >
            {item.icon}
            <span className="flex-1">{item.label}</span>
            <span className="flex items-center gap-1 text-[10px]">
              <Lock size={10} />
              {item.phase}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-auto border-t border-line p-4 text-[11px] text-faint">
        Phase 4 · Code Studio
        <br />
        Open a robot and choose Code to program it.
        <br />
        Drafts are saved in this browser only.
      </div>
    </aside>
  );
}
