import { FolderKanban, GraduationCap, LayoutDashboard, Library, Wand2 } from 'lucide-react';
import type { ReactNode } from 'react';

export interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
}

/** Phase 11: one navigation list for the sidebar and the mobile header. */
export const NAV: readonly NavItem[] = [
  { to: '/', label: 'Dashboard', icon: <LayoutDashboard size={16} aria-hidden /> },
  { to: '/learn', label: 'Learn Robotics', icon: <GraduationCap size={16} aria-hidden /> },
  { to: '/library', label: 'Project Library', icon: <Library size={16} aria-hidden /> },
  { to: '/projects', label: 'My Projects', icon: <FolderKanban size={16} aria-hidden /> },
  { to: '/builder', label: 'Robot Builder', icon: <Wand2 size={16} aria-hidden /> },
];
