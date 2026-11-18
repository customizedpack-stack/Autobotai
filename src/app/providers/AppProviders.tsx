import { useEffect, type ReactNode } from 'react';
import { connectConsoleToBus } from '../../stores/consoleStore';
import { log } from '../../utils/logger';
import { isStorageAvailable } from '../../utils/storage';

// Connect before the first render so no early message is lost.
connectConsoleToBus();

let booted = false;

export function AppProviders({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (booted) return;
    booted = true;
    log.info('system', 'Auto Robots with AI started. Phase 1 foundation build.');
    if (!isStorageAvailable()) {
      log.warning('storage', 'Browser storage is blocked. Drafts will be kept only until this tab closes.');
    }
  }, []);

  return <>{children}</>;
}
