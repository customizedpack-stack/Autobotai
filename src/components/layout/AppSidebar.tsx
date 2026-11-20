import { NavLink } from 'react-router-dom';
import { Bot, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';
import { Logo } from '../common/Logo';
import { ExperienceModeSelect } from '../../features/learning/components/ExperienceModeSelect';
import { NAV } from './navigation';

/** Modules that do not exist yet. Shown honestly, not as links. */
const NOT_YET: readonly { label: string; icon: ReactNode }[] = [
  { label: 'AI Assistant', icon: <Bot size={16} aria-hidden /> },
  { label: 'Community', icon: <Users size={16} aria-hidden /> },
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
      <div className="mt-2 px-4 text-[10.5px] font-semibold tracking-wider text-faint uppercase">Not available yet</div>
      <ul className="flex flex-col gap-0.5 p-2" aria-label="Modules not available yet">
        {NOT_YET.map((item) => (
          <li key={item.label} className="flex h-8 cursor-default items-center gap-2.5 rounded-md px-2.5 text-[13px] text-faint" title={`${item.label} is not part of AutoBotAI yet`}>
            {item.icon}
            <span className="flex-1">{item.label}</span>
          </li>
        ))}
      </ul>
      <div className="mt-auto space-y-3 border-t border-line p-4">
        <ExperienceModeSelect testId="sidebar-experience" />
        <p className="text-[11px] text-faint">
          Phase 11 · Learning platform
          <br />
          Drafts are saved in this browser only.
        </p>
      </div>
    </aside>
  );
}
