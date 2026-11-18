import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-line px-6 py-10 text-center">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-raised text-muted">{icon}</div>
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 max-w-sm text-xs text-muted">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
