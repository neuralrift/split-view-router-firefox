// background.js — Split View Router (Chrome MV3 service worker)
//
// Pairs come from Chrome's own split view: two tabs with the same
// tabs.Tab.splitViewId. The left tab (lower index) routes into the right one.
// The worker keeps no state in memory: settings live in storage.local, the
// per-split pause flags in storage.session (split IDs die with the browser
// session, and so should their flags).
importScripts('lib/core.js');

const {SPLIT_NONE, splitInfo, listSplits, originOf} = self.SVRCore;

const MODE_KEY = 'mode';
const ROUTING_KEY = 'routing';
const LOGGING_KEY = 'logging';
const LOG_KEY = 'log';
const PAUSED_KEY = 'pausedSplits'; // storage.session: [splitViewId, ...]
const LOG_MAX = 50;

async function getSettings() {
  const [local, session] = await Promise.all([
    chrome.storage.local.get([MODE_KEY, ROUTING_KEY, LOGGING_KEY]),
    chrome.storage.session.get(PAUSED_KEY)
  ]);
  return {
    mode: local[MODE_KEY] === 'ctrl' ? 'ctrl' : 'simple',
    routing: local[ROUTING_KEY] !== false,
    logging: local[LOGGING_KEY] !== false,
    paused: new Set((session[PAUSED_KEY] || []).map(Number))
  };
}

async function setPaused(splitViewId, paused) {
  const {paused: set} = await getSettings();
  if (paused) set.add(splitViewId); else set.delete(splitViewId);
  await chrome.storage.session.set({[PAUSED_KEY]: [...set]});
}

// Serialize log writes so concurrent calls don't clobber the buffer.
let logQueue = Promise.resolve();
function log(src, lvl, msg, data) {
  logQueue = logQueue.then(async () => {
    try {
      const stored = await chrome.storage.local.get([LOG_KEY, LOGGING_KEY]);
      if (stored[LOGGING_KEY] === false) return;
      const buf = stored[LOG_KEY] || [];
      buf.push({t: Date.now(), src, lvl, msg, data: data || null});
      while (buf.length > LOG_MAX) buf.shift();
      await chrome.storage.local.set({[LOG_KEY]: buf});
    } catch (e) { console.error(e); }
  });
  return logQueue;
}

async function windowTabs(windowId) {
  return chrome.tabs.query({windowId});
}

// Routing state for one tab, as the content script needs it.
function stateFor(tab, tabs, settings) {
  const info = splitInfo(tab, tabs);
  const isLeft = !!info && info.role === 'left';
  const paused = !!info && settings.paused.has(info.splitViewId);
  return {
    mode: settings.mode,
    enabled: isLeft && settings.routing && !paused,
    role: info ? info.role : null,
    paused
  };
}

async function stateForTabId(tabId) {
  const settings = await getSettings();
  let tab;
  try { tab = await chrome.tabs.get(tabId); } catch (e) { return stateFor(null, [], settings); }
  return stateFor(tab, await windowTabs(tab.windowId), settings);
}

// Push fresh state to every frame of every tab in the given windows (all
// windows when omitted). Split changes arrive as tab events, so content
// scripts learn about them without polling.
let broadcastTimer = 0;
let broadcastWindows = new Set();
let broadcastAll = false;
function scheduleBroadcast(windowId) {
  if (windowId == null) broadcastAll = true; else broadcastWindows.add(windowId);
  clearTimeout(broadcastTimer);
  broadcastTimer = setTimeout(flushBroadcast, 30);
}

async function flushBroadcast() {
  const all = broadcastAll;
  const windows = broadcastWindows;
  broadcastAll = false;
  broadcastWindows = new Set();
  const [settings, tabs] = await Promise.all([getSettings(), chrome.tabs.query({})]);
  await Promise.all(tabs
    .filter(t => all || windows.has(t.windowId))
    .map(t => chrome.tabs.sendMessage(t.id, {type: 'svr:state', state: stateFor(t, tabs, settings)}).catch(() => {})));
  await updateBadge(tabs, settings);
}

async function updateBadge(tabs, settings) {
  tabs = tabs || await chrome.tabs.query({});
  settings = settings || await getSettings();
  const count = listSplits(tabs).length;
  await chrome.action.setBadgeText({text: count ? String(count) : ''});
  if (!settings.routing) {
    await chrome.action.setBadgeBackgroundColor({color: '#999'});
    await chrome.action.setTitle({title: `Split View Router – ${count} split(s), routing paused`});
  } else {
    await chrome.action.setBadgeBackgroundColor({color: settings.mode === 'simple' ? '#0a84ff' : '#9059ff'});
    await chrome.action.setTitle({title: `Split View Router – ${count} split(s), ${settings.mode} mode`});
  }
}

async function route(url, sender) {
  const tabId = sender.tab && sender.tab.id;
  if (tabId == null) return {routed: false, reason: 'no_tab'};
  let parsed;
  try { parsed = new URL(url); } catch (e) { return {routed: false, reason: 'bad_url'}; }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return {routed: false, reason: 'bad_url'};

  const settings = await getSettings();
  let tab;
  try { tab = await chrome.tabs.get(tabId); } catch (e) { return {routed: false, reason: 'no_tab'}; }
  const info = splitInfo(tab, await windowTabs(tab.windowId));
  let reason = null;
  if (!info) reason = 'no_split';
  else if (info.role !== 'left') reason = 'not_left';
  else if (!settings.routing) reason = 'routing_off';
  else if (settings.paused.has(info.splitViewId)) reason = 'paused';
  if (reason) {
    log('bg', 'warn', 'route_dropped', {reason, tabId, origin: originOf(url)});
    // The content script was out of date; tell it now.
    scheduleBroadcast(tab.windowId);
    return {routed: false, reason};
  }

  try {
    await chrome.tabs.update(info.partner.id, {url: parsed.href});
  } catch (e) {
    log('bg', 'err', 'route_failed', {tabId, rightId: info.partner.id, error: String(e && e.message || e)});
    return {routed: false, reason: 'update_failed'};
  }
  log('bg', 'info', 'routed', {leftId: tabId, rightId: info.partner.id, origin: originOf(url), frameId: sender.frameId});
  return {routed: true};
}

async function getSplits() {
  const [settings, tabs] = await Promise.all([getSettings(), chrome.tabs.query({})]);
  return listSplits(tabs).map(s => ({
    splitViewId: s.splitViewId,
    windowId: s.windowId,
    leftId: s.left.id,
    rightId: s.right.id,
    leftTitle: s.left.title,
    rightTitle: s.right.title,
    paused: settings.paused.has(s.splitViewId)
  }));
}

async function handle(msg, sender) {
  switch (msg && msg.type) {
    case 'getState':
      return sender.tab ? stateForTabId(sender.tab.id) : null;
    case 'route':
      return route(String(msg.url || ''), sender);
    case 'getMode':
      return (await getSettings()).mode;
    case 'setMode': {
      if (msg.mode !== 'simple' && msg.mode !== 'ctrl') return false;
      const prev = (await getSettings()).mode;
      await chrome.storage.local.set({[MODE_KEY]: msg.mode});
      if (prev !== msg.mode) log('bg', 'info', 'mode_changed', {from: prev, to: msg.mode});
      return true;
    }
    case 'getRouting':
      return (await getSettings()).routing;
    case 'setRouting': {
      const prev = (await getSettings()).routing;
      await chrome.storage.local.set({[ROUTING_KEY]: !!msg.enabled});
      if (prev !== !!msg.enabled) log('bg', 'info', 'routing_toggled', {enabled: !!msg.enabled});
      return true;
    }
    case 'getSplits':
      return getSplits();
    case 'setPaused': {
      const id = Number(msg.splitViewId);
      if (!Number.isInteger(id) || id === SPLIT_NONE) return false;
      await setPaused(id, !!msg.paused);
      log('bg', 'info', msg.paused ? 'split_paused' : 'split_resumed', {splitViewId: id});
      return true;
    }
    case 'logEvent': {
      if (!['info', 'warn', 'err'].includes(msg.lvl) || typeof msg.msg !== 'string') return false;
      const data = msg.data && typeof msg.data === 'object' ? msg.data : {};
      if (sender.tab) data.tabId = sender.tab.id;
      log('cs', msg.lvl, msg.msg, data);
      return true;
    }
    case 'getDiagnostics': {
      const [settings, splits, stored] = await Promise.all([getSettings(), getSplits(), chrome.storage.local.get(LOG_KEY)]);
      const manifest = chrome.runtime.getManifest();
      return {
        generatedAt: new Date().toISOString(),
        extension: {name: manifest.name, version: manifest.version},
        browser: {userAgent: navigator.userAgent},
        state: {mode: settings.mode, routing: settings.routing, logging: settings.logging, pairs: splits},
        log: (stored[LOG_KEY] || []).map(e => ({ts: new Date(e.t).toISOString(), ...e}))
      };
    }
    case 'clearLog':
      await chrome.storage.local.set({[LOG_KEY]: []});
      return true;
    case 'getLogging':
      return (await getSettings()).logging;
    case 'setLogging': {
      const prev = (await getSettings()).logging;
      const next = !!msg.enabled;
      if (prev !== next) {
        if (next) {
          await chrome.storage.local.set({[LOGGING_KEY]: true});
          log('bg', 'info', 'logging_toggled', {enabled: true});
        } else {
          // Log the off-event before flipping the flag so it lands in the buffer.
          await log('bg', 'info', 'logging_toggled', {enabled: false});
          await chrome.storage.local.set({[LOGGING_KEY]: false});
        }
      }
      return true;
    }
    default:
      return undefined;
  }
}

// Listeners are registered synchronously at top level so a restarted worker
// receives the event that woke it.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handle(msg, sender).then(sendResponse, (e) => {
    console.error(e);
    sendResponse(undefined);
  });
  return true;
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if ('splitViewId' in changeInfo) scheduleBroadcast(tab.windowId);
});
chrome.tabs.onMoved.addListener((tabId, info) => scheduleBroadcast(info.windowId));
chrome.tabs.onAttached.addListener((tabId, info) => scheduleBroadcast(info.newWindowId));
chrome.tabs.onDetached.addListener((tabId, info) => scheduleBroadcast(info.oldWindowId));
chrome.tabs.onRemoved.addListener((tabId, info) => scheduleBroadcast(info.windowId));

chrome.storage.onChanged.addListener((changes, area) => {
  if (changes[MODE_KEY] || changes[ROUTING_KEY] || (area === 'session' && changes[PAUSED_KEY])) scheduleBroadcast();
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-mode') return;
  const current = (await getSettings()).mode;
  const next = current === 'simple' ? 'ctrl' : 'simple';
  await chrome.storage.local.set({[MODE_KEY]: next});
  log('bg', 'info', 'mode_changed', {from: current, to: next, via: 'shortcut'});
});

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.local.get([MODE_KEY, ROUTING_KEY]);
  if (existing[MODE_KEY] === undefined) await chrome.storage.local.set({[MODE_KEY]: 'simple'});
  if (existing[ROUTING_KEY] === undefined) await chrome.storage.local.set({[ROUTING_KEY]: true});
  await injectIntoOpenTabs();
});

// Manifest content scripts only reach pages loaded after install, and an
// update orphans the old copies. Inject into the tabs already open.
async function injectIntoOpenTabs() {
  const tabs = await chrome.tabs.query({url: ['http://*/*', 'https://*/*']});
  await Promise.all(tabs.map(async (t) => {
    const target = {tabId: t.id, allFrames: true};
    try {
      await chrome.scripting.executeScript({target, world: 'MAIN', files: ['main-world.js']});
      await chrome.scripting.executeScript({target, files: ['lib/core.js', 'content.js']});
    } catch (e) { /* restricted page (Web Store, error page) */ }
  }));
}

updateBadge().catch(() => {});
