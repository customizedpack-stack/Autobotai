import type { Difficulty, ProjectDefinition } from '../model/types';

export interface LibraryFilter {
  text: string;
  difficulty: Difficulty | 'all';
  /** 'hardware': a verified physical path exists (build guide or deployment). */
  support: 'all' | 'simulation' | 'hardware';
}

export const DEFAULT_FILTER: LibraryFilter = { text: '', difficulty: 'all', support: 'all' };

const fullySimulated = (d: ProjectDefinition) => d.simulationCapabilities.every((c) => c.status === 'supported' || c.status === 'simulation-only');
const hasPhysicalPath = (d: ProjectDefinition) => d.physicalRequirements.some((c) => c.status === 'build-guide' || c.status === 'hardware-deployment');

export function filterProjects(defs: readonly ProjectDefinition[], f: LibraryFilter): ProjectDefinition[] {
  const words = f.text.toLowerCase().split(/\s+/).filter(Boolean);
  return defs.filter((d) => {
    if (f.difficulty !== 'all' && d.difficulty !== f.difficulty) return false;
    if (f.support === 'simulation' && !fullySimulated(d)) return false;
    if (f.support === 'hardware' && !hasPhysicalPath(d)) return false;
    if (words.length === 0) return true;
    const hay = [d.name, d.summary, d.purpose, ...d.keywords].join(' ').toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}
