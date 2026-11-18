import { isRouteErrorResponse, useRouteError } from 'react-router-dom';

/** Friendly screen for unexpected errors instead of the framework's developer page. */
export function RouteError() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error) ? `${error.status} ${error.statusText}` : error instanceof Error ? error.message : String(error);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center" role="alert">
      <h1 className="text-lg font-semibold">Something went wrong</h1>
      <p className="max-w-md text-[13px] text-muted">
        The workspace hit an unexpected error. Your last saved draft is safe in this browser.
      </p>
      <pre className="max-w-xl overflow-auto rounded-md bg-panel p-3 text-left font-mono text-[11px] text-err">{message}</pre>
      <div className="flex gap-2">
        <button type="button" onClick={() => window.location.reload()} className="rounded-md bg-accent px-3 py-1.5 text-[13px] font-medium text-white">
          Reload
        </button>
        <a href="./" className="rounded-md border border-line px-3 py-1.5 text-[13px] text-muted hover:text-ink">
          Dashboard
        </a>
      </div>
    </div>
  );
}
