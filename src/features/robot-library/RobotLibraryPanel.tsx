import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, PackagePlus } from 'lucide-react';
import { RobotThumbnail } from '../../components/dashboard/RobotThumbnail';
import { insertTemplate } from '../projects/workspaceActions';
import { ALL_TEMPLATES, FEATURED_TEMPLATES, categoryLabel, type RobotTemplate } from './templates';

function matches(template: RobotTemplate, query: string): boolean {
  const q = query.trim().toLowerCase();
  return !q || template.name.toLowerCase().includes(q) || template.summary.toLowerCase().includes(q) || template.category.includes(q);
}

/** Starter robots that can be inserted into the open scene. */
export function RobotLibraryPanel({ query }: { query: string }) {
  const items = FEATURED_TEMPLATES.filter((t) => matches(t, query));
  if (items.length === 0) return <p className="px-3 py-6 text-center text-xs text-muted">No robots match “{query}”.</p>;
  return (
    <ul className="space-y-1.5 p-2" data-testid="robot-library">
      {items.map((template) => (
        <li key={template.id} className="overflow-hidden rounded-md border border-line-soft bg-app">
          <div className="h-16 border-b border-line-soft">
            <RobotThumbnail category={template.category} templateId={template.id} />
          </div>
          <div className="flex items-center gap-2 p-2">
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-semibold">{template.name}</div>
              <div className="text-[10.5px] text-faint">
                {categoryLabel(template.category)} · {template.build().length} parts
              </div>
            </div>
            <button
              type="button"
              onClick={() => insertTemplate(template.id)}
              className="inline-flex h-6 items-center gap-1 rounded border border-line px-1.5 text-[11px] text-muted hover:border-accent hover:text-ink"
              title={`Insert ${template.name} parts into this scene`}
            >
              <PackagePlus size={12} /> Insert
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Project templates: start a new project from a template. */
export function TemplatesPanel({ query }: { query: string }) {
  const navigate = useNavigate();
  const items = ALL_TEMPLATES.filter((t) => matches(t, query));
  if (items.length === 0) return <p className="px-3 py-6 text-center text-xs text-muted">No templates match “{query}”.</p>;
  return (
    <div className="p-2" data-testid="templates-panel">
      <p className="px-1 pb-2 text-[10.5px] leading-relaxed text-faint">
        Start a separate project from a template. Your current project stays as it is.
      </p>
      <ul className="space-y-1">
        {items.map((template) => (
          <li key={template.id}>
            <button
              type="button"
              onClick={() => navigate(`/new?template=${template.id}`)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-raised"
            >
              <span className="h-9 w-14 shrink-0 overflow-hidden rounded border border-line-soft">
                <RobotThumbnail category={template.category} templateId={template.id} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium">{template.name}</span>
                <span className="block truncate text-[10.5px] text-faint">{template.summary}</span>
              </span>
              <ArrowUpRight size={13} className="shrink-0 text-faint" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
