import '@testing-library/jest-dom/vitest';

// Mock Tauri APIs for testing
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

// Event-delivering mock for @tauri-apps/api/event: `listen` registers the
// handler in a registry and tests fire events with fireTauriEvent(name,
// payload), matching real Tauri semantics (async registration, events with
// no registered listener are dropped, unlisten removes the handler).
type TauriEventHandler = (event: { event: string; id: number; payload: unknown }) => void;

const { tauriEventRegistry } = vi.hoisted(() => ({
  tauriEventRegistry: new Map<string, Set<TauriEventHandler>>(),
}));

export function fireTauriEvent(name: string, payload: unknown): void {
  const handlers = tauriEventRegistry.get(name);
  if (!handlers) return;
  for (const handler of [...handlers]) {
    handler({ event: name, id: 0, payload });
  }
}

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn((name: string, handler: TauriEventHandler) => {
    let handlers = tauriEventRegistry.get(name);
    if (!handlers) {
      handlers = new Set();
      tauriEventRegistry.set(name, handlers);
    }
    handlers.add(handler);
    return Promise.resolve(() => {
      tauriEventRegistry.get(name)?.delete(handler);
    });
  }),
  emit: vi.fn(),
}));

afterEach(() => {
  tauriEventRegistry.clear();
});

vi.mock('@tauri-apps/plugin-opener', () => ({
  openPath: vi.fn(),
  openUrl: vi.fn(),
}));

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
    get length() { return Object.keys(store).length; },
    key: (index: number) => Object.keys(store)[index] ?? null,
  };
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock });

Object.defineProperty(URL, 'createObjectURL', {
  writable: true,
  value: vi.fn(() => 'blob:mock-url'),
});

Object.defineProperty(URL, 'revokeObjectURL', {
  writable: true,
  value: vi.fn(),
});

// jsdom has no scrollIntoView; chat components call it on new messages.
Element.prototype.scrollIntoView = vi.fn();

// jsdom has no ResizeObserver; chat components observe the scroll container.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;

// jsdom has no matchMedia; components using useThemeBackground/useDarkMode
// need a minimal stub.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});
