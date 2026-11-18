import { createJSONStorage, type StateStorage } from 'zustand/middleware';

/**
 * localStorage wrapper that never throws. Some browsers (private mode,
 * sandboxed iframes) block storage; the app then keeps working in memory.
 */
const memory = new Map<string, string>();

const safeStateStorage: StateStorage = {
  getItem: (name) => {
    try {
      return window.localStorage.getItem(name);
    } catch {
      return memory.get(name) ?? null;
    }
  },
  setItem: (name, value) => {
    try {
      window.localStorage.setItem(name, value);
    } catch {
      memory.set(name, value);
    }
  },
  removeItem: (name) => {
    try {
      window.localStorage.removeItem(name);
    } catch {
      memory.delete(name);
    }
  },
};

export const safeStorage = createJSONStorage(() => safeStateStorage);

export function isStorageAvailable(): boolean {
  try {
    const key = '__arai_probe__';
    window.localStorage.setItem(key, '1');
    window.localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
