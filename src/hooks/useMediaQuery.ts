import { useSyncExternalStore } from 'react';

/** Subscribe to a CSS media query. Returns false where matchMedia is unavailable. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => {};
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false),
    () => false,
  );
}

/** Below the `lg` breakpoint (1024 px) side panels become slide-over drawers. */
export const COMPACT_WORKSPACE_QUERY = '(max-width: 1023.98px)';
