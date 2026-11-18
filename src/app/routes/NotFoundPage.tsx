import { Link } from 'react-router-dom';

export function NotFoundPage({ message = 'This page does not exist.' }: { message?: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="font-mono text-xs text-faint">404</div>
      <h1 className="text-lg font-semibold">Not found</h1>
      <p className="max-w-sm text-[13px] text-muted">{message}</p>
      <Link to="/" className="rounded-md bg-accent px-3 py-1.5 text-[13px] font-medium text-white hover:bg-accent-strong">
        Go to dashboard
      </Link>
    </div>
  );
}
