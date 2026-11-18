import { Link } from 'react-router-dom';
import { categoryLabel, type RobotTemplate } from '../../features/robot-library/templates';
import { Badge } from '../common/Badge';
import { RobotThumbnail } from './RobotThumbnail';

export function TemplateCard({ template }: { template: RobotTemplate }) {
  return (
    <Link
      to={`/new?template=${template.id}`}
      className="group block overflow-hidden rounded-lg border border-line bg-panel transition-colors hover:border-accent/60"
      aria-label={`Start a new robot from the ${template.name} template`}
    >
      <div className="relative aspect-[16/8] border-b border-line-soft">
        <RobotThumbnail category={template.category} templateId={template.id} />
        <Badge className="absolute top-2 left-2">Sample template</Badge>
      </div>
      <div className="p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px] font-semibold">{template.name}</span>
          <span className="text-[11px] text-muted">{categoryLabel(template.category)}</span>
        </div>
        <p className="mt-1 line-clamp-2 text-xs text-muted">{template.summary}</p>
        <div className="mt-2 flex flex-wrap gap-1">
          {template.highlights.map((h) => (
            <span key={h} className="rounded bg-raised px-1.5 py-0.5 text-[10.5px] text-muted">
              {h}
            </span>
          ))}
        </div>
      </div>
    </Link>
  );
}
