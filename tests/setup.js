import { vi } from 'vitest';

function createEventMock(name) {
  const fns = new Set();
  const mock = {
    addListener: vi.fn((fn) => { fns.add(fn); }),
    removeListener: vi.fn((fn) => fns.delete(fn)),
    hasListener: vi.fn((fn) => fns.has(fn)),
    dispatch: (...args) => {
      for (const fn of fns) fn(...args);
    },
    _fns: fns,
  };
  return mock;
}

let storage = {};
let sessions = {};

global.browser = {
  storage: {
    local: {
      get: vi.fn(async (keys) => {
        if (typeof keys === 'string') return { [keys]: storage[keys] };
        if (Array.isArray(keys)) {
          const res = {};
          keys.forEach(k => { res[k] = storage[k]; });
          return res;
        }
        return storage;
      }),
      set: vi.fn(async (obj) => {
        Object.assign(storage, obj);
        if (global.browser.storage.onChanged.dispatch) {
            const changes = {};
            for (const [k, v] of Object.entries(obj)) changes[k] = { newValue: v };
            global.browser.storage.onChanged.dispatch(changes);
        }
      }),
    },
    onChanged: createEventMock('storage.onChanged'),
  },
  sessions: {
    setTabValue: vi.fn(async (tabId, key, value) => {
      sessions[`${tabId}_${key}`] = value;
    }),
    getTabValue: vi.fn(async (tabId, key) => {
      return sessions[`${tabId}_${key}`];
    }),
    removeTabValue: vi.fn(async (tabId, key) => {
      delete sessions[`${tabId}_${key}`];
    }),
  },
  tabs: {
    query: vi.fn(async () => []),
    update: vi.fn(async () => ({})),
    get: vi.fn(async (id) => ({ id, title: `Tab ${id}` })),
    onHighlighted: createEventMock('tabs.onHighlighted'),
    onActivated: createEventMock('tabs.onActivated'),
    onRemoved: createEventMock('tabs.onRemoved'),
    onUpdated: createEventMock('tabs.onUpdated'),
  },
  windows: {
    WINDOW_ID_NONE: -1,
    onFocusChanged: createEventMock('windows.onFocusChanged'),
  },
  contextMenus: {
    create: vi.fn(),
    update: vi.fn(),
    removeAll: vi.fn(async () => {}),
    refresh: vi.fn(async () => {}),
    onClicked: createEventMock('contextMenus.onClicked'),
    onShown: createEventMock('contextMenus.onShown'),
  },
  runtime: {
    onInstalled: createEventMock('runtime.onInstalled'),
    onStartup: createEventMock('runtime.onStartup'),
    onMessage: createEventMock('runtime.onMessage'),
    getManifest: vi.fn(() => ({ name: 'Test', version: '1.0' })),
    sendMessage: vi.fn(async (msg) => {
      const fns = [...global.browser.runtime.onMessage._fns];
      for (const fn of fns) {
        const res = fn(msg, { id: 'test-extension' });
        if (res instanceof Promise) return await res;
        if (res !== undefined) return res;
      }
    }),
  },
  commands: {
    onCommand: createEventMock('commands.onCommand'),
  },
  browserAction: {
    setBadgeText: vi.fn(),
    setBadgeBackgroundColor: vi.fn(),
    setTitle: vi.fn(),
  },
};

global.chrome = global.browser;

const mockCrypto = {
  randomUUID: () => Math.random().toString(36).slice(2),
  getRandomValues: (arr) => {
    for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
    return arr;
  }
};

try {
  Object.defineProperty(global, 'crypto', { value: mockCrypto, configurable: true });
} catch (e) {
  global.crypto = mockCrypto;
}

const domListeners = [];
const originalAddEventListener = EventTarget.prototype.addEventListener;
const originalRemoveEventListener = EventTarget.prototype.removeEventListener;

EventTarget.prototype.addEventListener = function(type, listener, options) {
  domListeners.push({ target: this, type, listener, options });
  return originalAddEventListener.call(this, type, listener, options);
};

global.__resetBrowserMock = () => {
  storage = {};
  sessions = {};
  vi.clearAllMocks();
  // Clear all event listeners
  [
    global.browser.storage.onChanged,
    global.browser.tabs.onHighlighted,
    global.browser.tabs.onActivated,
    global.browser.tabs.onRemoved,
    global.browser.tabs.onUpdated,
    global.browser.windows.onFocusChanged,
    global.browser.contextMenus.onClicked,
    global.browser.contextMenus.onShown,
    global.browser.runtime.onInstalled,
    global.browser.runtime.onStartup,
    global.browser.runtime.onMessage,
    global.browser.commands.onCommand,
  ].forEach(m => m._fns.clear());

  // Clear DOM listeners
  while (domListeners.length > 0) {
    const { target, type, listener, options } = domListeners.pop();
    originalRemoveEventListener.call(target, type, listener, options);
  }
};
