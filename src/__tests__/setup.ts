import '@testing-library/jest-dom'

// Polyfill ResizeObserver for jsdom (needed by TerminalDrawer tests)
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

// Vitest 4 installs an empty {} as localStorage / sessionStorage when the
// optional --localstorage-file flag is unset, shadowing jsdom's real Storage
// implementation. Replace with a Map-backed polyfill so production code that
// uses Storage APIs (e.g. tab-guard.ts) works inside tests.
function createStoragePolyfill(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string): string | null {
      return store.has(key) ? (store.get(key) as string) : null;
    },
    key(index: number): string | null {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string): void {
      store.delete(key);
    },
    setItem(key: string, value: string): void {
      store.set(key, String(value));
    },
  } as Storage;
}

function ensureStorage(name: 'localStorage' | 'sessionStorage'): void {
  const existing = (globalThis as unknown as Record<string, unknown>)[name] as
    | Storage
    | undefined;
  if (existing && typeof existing.getItem === 'function') return;
  Object.defineProperty(globalThis, name, {
    value: createStoragePolyfill(),
    configurable: true,
    writable: true,
  });
}

ensureStorage('localStorage');
ensureStorage('sessionStorage');
