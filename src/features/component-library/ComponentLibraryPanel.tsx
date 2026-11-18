import { useState } from 'react';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { addComponent } from '../projects/workspaceActions';
import { COMPONENT_CATEGORIES, searchComponents, type ComponentDefinition } from './catalog';
import { cn } from '../../utils/cn';

function ShapeGlyph({ component }: { component: ComponentDefinition }) {
  const shape = component.geometry.shape;
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-line-soft bg-app">
      <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
        {shape === 'box' && <rect x="4" y="5" width="12" height="10" rx="1.5" fill={component.color} fillOpacity="0.85" />}
        {shape === 'cylinder' && (
          <>
            <rect x="5" y="5" width="10" height="10" fill={component.color} fillOpacity="0.85" />
            <ellipse cx="10" cy="5" rx="5" ry="2" fill={component.color} />
            <ellipse cx="10" cy="15" rx="5" ry="2" fill={component.color} fillOpacity="0.85" />
          </>
        )}
        {shape === 'sphere' && <circle cx="10" cy="10" r="6" fill={component.color} fillOpacity="0.9" />}
        {shape === 'capsule' && <rect x="6.5" y="3" width="7" height="14" rx="3.5" fill={component.color} fillOpacity="0.9" />}
        {shape === 'cone' && <path d="M10 3 L16 16 H4 Z" fill={component.color} fillOpacity="0.9" />}
      </svg>
    </span>
  );
}

/** Left panel: component catalog. Clicking a component adds a placeholder at the origin. */
export function ComponentLibraryPanel({ query }: { query: string }) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const results = searchComponents(query);

  if (results.length === 0) {
    return <p className="px-3 py-6 text-center text-xs text-muted">No components match “{query}”.</p>;
  }

  return (
    <div className="pb-2" data-testid="component-library">
      {COMPONENT_CATEGORIES.map((category) => {
        const items = results.filter((c) => c.category === category.id);
        if (items.length === 0) return null;
        const isCollapsed = collapsed[category.id] && !query;
        return (
          <div key={category.id}>
            <button
              type="button"
              onClick={() => setCollapsed((s) => ({ ...s, [category.id]: !s[category.id] }))}
              className="flex h-7 w-full items-center gap-1 px-2 text-[10.5px] font-semibold tracking-wider text-muted uppercase hover:text-ink"
              aria-expanded={!isCollapsed}
            >
              {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
              {category.label}
              <span className="ml-auto font-mono text-[10px] font-normal text-faint">{items.length}</span>
            </button>
            {!isCollapsed && (
              <ul className="px-1.5">
                {items.map((component) => (
                  <li key={component.id}>
                    <button
                      type="button"
                      onClick={() => addComponent(component.id)}
                      title={`Add ${component.name} to the scene`}
                      data-testid={`component-${component.id}`}
                      className={cn(
                        'group flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-raised',
                      )}
                    >
                      <ShapeGlyph component={component} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium">{component.name}</span>
                        <span className="block truncate text-[10.5px] text-faint">{component.description}</span>
                      </span>
                      <Plus size={13} className="shrink-0 text-faint opacity-0 group-hover:opacity-100" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
      <p className="px-3 pt-3 text-[10.5px] leading-relaxed text-faint">
        Components are placeholder shapes in Phase 1. Drag-and-drop placement and attachment arrive in Phase 2.
      </p>
    </div>
  );
}
