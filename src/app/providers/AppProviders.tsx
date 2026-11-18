import { useEffect, type ReactNode } from 'react';
import { log } from '../../utils/logger';
import { isStorageAvailable } from '../../utils/storage';

let booted = false;

export function AppProviders({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (booted) return;
    booted = true;
    log.info('system', 'Auto Robots with AI started. Phase 3 Robot Movement & Control.');
    if (!isStorageAvailable()) {
      log.warning('storage', 'Browser storage is blocked. Drafts will be kept only until this tab closes.');
    }
  }, []);

  return <>{children}</>;
}
