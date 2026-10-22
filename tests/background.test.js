import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import vm from 'vm';

const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

function event() {
  const listeners = [];
  return {addListener: (fn) => listeners.push(fn), listeners};
}

// Loads background.js into a fresh context with a minimal chrome.* mock.
function loadBackground({tabs, local = {}, session = {}}) {
  const stores = {local: {...local}, session: {...session}};
  const area = (name) => ({
    get: vi.fn(async (keys) => {
      const ks = Array.isArray(keys) ? keys : [keys];
      return Object.fromEntries(ks.filter(k => k in stores[name]).map(k => [k, stores[name][k]]));
    }),
    set: vi.fn(async (obj) => { Object.assign(stores[name], obj); })
  });
  const chrome = {
    runtime: {onMessage: event(), onInstalled: event(), getManifest: () => ({name: 'Split View Router', version: '2.0.0'})},
    storage: {local: area('local'), session: area('session'), onChanged: event()},
    tabs: {
      query: vi.fn(async (q) => tabs.filter(t => q.windowId == null || t.windowId === q.windowId)),
      get: vi.fn(async (id) => {
        const t = tabs.find(x => x.id === id);
        if (!t) throw new Error(`No tab with id: ${id}`);
        return t;
      }),
      update: vi.fn(async () => ({})),
      sendMessage: vi.fn(async () => {}),
      onUpdated: event(), onMoved: event(), onAttached: event(), onDetached: event(), onRemoved: event()
    },
    action: {setBadgeText: vi.fn(async () => {}), setBadgeBackgroundColor: vi.fn(async () => {}), setTitle: vi.fn(async () => {})},
    commands: {onCommand: event()},
    scripting: {executeScript: vi.fn(async () => [])}
  };
  const ctx = {chrome, console, URL, navigator: {userAgent: 'test'}, setTimeout, clearTimeout, Promise, Date};
  ctx.self = ctx;
  ctx.globalThis = ctx;
  ctx.importScripts = (...files) => files.forEach(f => vm.runInContext(read(f), ctx));
  vm.createContext(ctx);
  vm.runInContext(read('background.js'), ctx);
  const send = (msg, sender = {}) => new Promise((resolve) => {
    chrome.runtime.onMessage.listeners[0](msg, sender, resolve);
  });
  return {chrome, stores, send};
}

const tab = (id, index, splitViewId = -1, windowId = 1) => ({id, index, splitViewId, windowId, title: `t${id}`});

describe('background routing', () => {
  let tabs;
  beforeEach(() => { tabs = [tab(1, 0, 5), tab(2, 1, 5), tab(3, 2)]; });

  it('routes from the left split tab into the right one', async () => {
    const {chrome, send} = loadBackground({tabs});
    const res = await send({type: 'route', url: 'https://sn.example.com/incident.do?sys_id=1'}, {tab: {id: 1}, frameId: 3});
    expect(res).toEqual({routed: true});
    expect(chrome.tabs.update).toHaveBeenCalledWith(2, {url: 'https://sn.example.com/incident.do?sys_id=1'});
  });

  it('does not route from the right tab or an unsplit tab', async () => {
    const {chrome, send} = loadBackground({tabs});
    expect(await send({type: 'route', url: 'https://a.example/'}, {tab: {id: 2}})).toEqual({routed: false, reason: 'not_left'});
    expect(await send({type: 'route', url: 'https://a.example/'}, {tab: {id: 3}})).toEqual({routed: false, reason: 'no_split'});
    expect(chrome.tabs.update).not.toHaveBeenCalled();
  });

  it('honours the global routing switch and per-split pause', async () => {
    let bg = loadBackground({tabs, local: {routing: false}});
    expect(await bg.send({type: 'route', url: 'https://a.example/'}, {tab: {id: 1}})).toMatchObject({reason: 'routing_off'});
    bg = loadBackground({tabs, session: {pausedSplits: [5]}});
    expect(await bg.send({type: 'route', url: 'https://a.example/'}, {tab: {id: 1}})).toMatchObject({reason: 'paused'});
  });

  it('rejects non-http urls', async () => {
    const {chrome, send} = loadBackground({tabs});
    expect(await send({type: 'route', url: 'javascript:alert(1)'}, {tab: {id: 1}})).toMatchObject({routed: false, reason: 'bad_url'});
    expect(chrome.tabs.update).not.toHaveBeenCalled();
  });

  it('reports state per tab', async () => {
    const {send} = loadBackground({tabs, local: {mode: 'ctrl'}});
    expect(await send({type: 'getState'}, {tab: {id: 1}})).toEqual({mode: 'ctrl', enabled: true, role: 'left', paused: false});
    expect(await send({type: 'getState'}, {tab: {id: 2}})).toMatchObject({enabled: false, role: 'right'});
    expect(await send({type: 'getState'}, {tab: {id: 3}})).toMatchObject({enabled: false, role: null});
  });

  it('lists splits and pauses one in session storage', async () => {
    const {send, stores} = loadBackground({tabs});
    expect(await send({type: 'getSplits'})).toEqual([
      {splitViewId: 5, windowId: 1, leftId: 1, rightId: 2, leftTitle: 't1', rightTitle: 't2', paused: false}
    ]);
    expect(await send({type: 'setPaused', splitViewId: 5, paused: true})).toBe(true);
    expect(stores.session.pausedSplits).toEqual([5]);
    expect((await send({type: 'getSplits'}))[0].paused).toBe(true);
  });

  it('pushes state to tabs when a split changes', async () => {
    const {chrome} = loadBackground({tabs});
    chrome.tabs.onUpdated.listeners[0](1, {splitViewId: 5}, tabs[0]);
    await vi.waitFor(() => expect(chrome.tabs.sendMessage).toHaveBeenCalledTimes(3));
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(1, {type: 'svr:state', state: expect.objectContaining({enabled: true})});
  });

  it('validates setMode', async () => {
    const {send, stores} = loadBackground({tabs});
    expect(await send({type: 'setMode', mode: 'bogus'})).toBe(false);
    expect(await send({type: 'setMode', mode: 'ctrl'})).toBe(true);
    expect(stores.local.mode).toBe('ctrl');
  });
});
