import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Check } from 'lucide-react';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { RobotThumbnail } from '../../components/dashboard/RobotThumbnail';
import {
  FEATURED_TEMPLATES,
  ROBOT_CATEGORIES,
  categoryLabel,
  findTemplate,
  templatesForCategory,
} from '../../features/robot-library/templates';
import { useProjectStore } from '../../stores/projectStore';
import type { RobotCategory } from '../../types/project';
import { cn } from '../../utils/cn';

const MAX_NAME = 60;

function hasFeaturedTemplate(category: RobotCategory): boolean {
  return FEATURED_TEMPLATES.some((t) => t.category === category);
}

export function NewRobotPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const createProject = useProjectStore((s) => s.createProject);

  const preset = findTemplate(params.get('template') ?? '');
  const [category, setCategory] = useState<RobotCategory>(preset?.category ?? 'mobile');
  const [templateId, setTemplateId] = useState<string>(preset?.id ?? 'explorer-bot');
  const [name, setName] = useState<string>(preset && preset.id !== 'blank' ? `My ${preset.name}` : 'My Explorer Bot');
  const [touched, setTouched] = useState(false);

  const templates = useMemo(() => templatesForCategory(category), [category]);
  const template = findTemplate(templateId) ?? templates[0];
  const trimmed = name.trim();
  const nameError = !trimmed ? 'Enter a robot name.' : trimmed.length > MAX_NAME ? `Use ${MAX_NAME} characters or fewer.` : null;

  const chooseCategory = (next: RobotCategory) => {
    setCategory(next);
    const first = templatesForCategory(next)[0];
    if (first) {
      setTemplateId(first.id);
      if (!touched) setName(first.id === 'blank' ? `My ${categoryLabel(next)}` : `My ${first.name}`);
    }
  };

  const chooseTemplate = (id: string) => {
    setTemplateId(id);
    const chosen = findTemplate(id);
    if (chosen && !touched) setName(chosen.id === 'blank' ? `My ${categoryLabel(category)}` : `My ${chosen.name}`);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (nameError || !template) return;
    const project = createProject({ name: trimmed, category, templateId: template.id });
    navigate(`/workspace/${project.id}`);
  };

  return (
    <form onSubmit={submit} className="mx-auto max-w-6xl px-6 py-8">
      <button
        type="button"
        onClick={() => navigate('/')}
        className="mb-4 inline-flex items-center gap-1.5 text-xs text-muted hover:text-ink"
      >
        <ArrowLeft size={13} /> Back to dashboard
      </button>
      <h1 className="text-xl font-semibold tracking-tight">Create a new robot</h1>
      <p className="mt-1 text-[13px] text-muted">Pick a robot type and a starter template, then name your project.</p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-6">
          <fieldset>
            <legend className="mb-2 text-xs font-semibold tracking-wider text-muted uppercase">1. Robot category</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {ROBOT_CATEGORIES.map((c) => {
                const active = c.id === category;
                return (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => chooseCategory(c.id)}
                    className={cn(
                      'rounded-lg border p-3 text-left transition-colors',
                      active ? 'border-accent bg-accent-soft' : 'border-line bg-panel hover:border-[#3d4553]',
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] font-semibold">{c.label}</span>
                      {active && <Check size={14} className="text-accent" />}
                    </div>
                    <p className="mt-1 text-xs text-muted">{c.description}</p>
                    {!hasFeaturedTemplate(c.id) && <p className="mt-1.5 text-[10.5px] text-faint">Starter template coming in a later phase</p>}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-2 text-xs font-semibold tracking-wider text-muted uppercase">2. Starter template</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {templates.map((t) => {
                const active = t.id === template?.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => chooseTemplate(t.id)}
                    className={cn(
                      'flex gap-3 rounded-lg border p-2.5 text-left transition-colors',
                      active ? 'border-accent bg-accent-soft' : 'border-line bg-panel hover:border-[#3d4553]',
                    )}
                  >
                    <div className="h-16 w-28 shrink-0 overflow-hidden rounded border border-line-soft">
                      <RobotThumbnail category={t.category} templateId={t.id} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-[13px] font-semibold">
                        {t.name}
                        {active && <Check size={13} className="text-accent" />}
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted">{t.summary}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-2 text-xs font-semibold tracking-wider text-muted uppercase">3. Robot name</legend>
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setTouched(true);
              }}
              maxLength={MAX_NAME + 10}
              aria-label="Robot name"
              aria-invalid={touched && nameError !== null}
              className={cn(
                'h-9 w-full max-w-md rounded-md border bg-panel px-3 text-[13px] outline-none focus:border-accent',
                touched && nameError ? 'border-err' : 'border-line',
              )}
            />
            {touched && nameError && <p className="mt-1.5 text-xs text-err">{nameError}</p>}
          </fieldset>
        </div>

        <aside className="h-fit rounded-lg border border-line bg-panel lg:sticky lg:top-6">
          <div className="aspect-[16/9] border-b border-line-soft">
            {template && <RobotThumbnail category={category} templateId={template.id} />}
          </div>
          <div className="space-y-3 p-4">
            <div>
              <div className="text-[11px] text-faint">Project</div>
              <div className="truncate text-sm font-semibold">{trimmed || 'Untitled'}</div>
            </div>
            <dl className="grid grid-cols-2 gap-2 text-xs">
              <dt className="text-faint">Category</dt>
              <dd>{categoryLabel(category)}</dd>
              <dt className="text-faint">Template</dt>
              <dd>{template?.name}</dd>
              <dt className="text-faint">Parts</dt>
              <dd>{template?.build().length ?? 0} placeholders</dd>
              <dt className="text-faint">Storage</dt>
              <dd>This browser</dd>
            </dl>
            <Badge tone="ok">Physics simulation included</Badge>
            <Button type="submit" variant="primary" className="w-full" disabled={touched && nameError !== null}>
              Create Workspace
            </Button>
          </div>
        </aside>
      </div>
    </form>
  );
}
