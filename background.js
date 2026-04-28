// background.js — Split View Router
const PAIRS_KEY = "pairs"; // { leftId: rightId, ... }
const MODE_KEY = "mode";
const ROUTING_KEY = "routing";
const PAUSED_KEY = "paused";
const LOG_KEY = "log";
const LOGGING_KEY = "logging";
const LOG_MAX = 50;
// sessions.tabValue key — survives Firefox session restore so pairs can be
// rebuilt after a browser restart.
const MARKER_KEY = "svr-pair";

async function getLogging() {
  const data = await browser.storage.local.get(LOGGING_KEY);
  return data[LOGGING_KEY] !== false;
}

let storageMutex = Promise.resolve();
function withStorageMutex(fn) {
  const p = storageMutex.then(async () => {
    try { await fn(); } catch (e) { log("bg", "err", "storage_mutex_error", {error: String(e)}); }
  });
  storageMutex = p.catch(() => {});
  return p;
}

const cspBlockedTabs = new Set();
browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') cspBlockedTabs.delete(tabId);
});

// Serialize log writes so concurrent calls don't clobber the buffer.
let logQueue = Promise.resolve();
function log(src, lvl, msg, data) {
  logQueue = logQueue.then(async () => {
    try {
      const stored = await browser.storage.local.get([LOG_KEY, LOGGING_KEY]);
      if (stored[LOGGING_KEY] === false) return;
      const buf = stored[LOG_KEY] || [];
      buf.push({t: Date.now(), src, lvl, msg, data: data || null});
      while (buf.length > LOG_MAX) buf.shift();
      await browser.storage.local.set({[LOG_KEY]: buf});
    } catch (e) { console.error(e);  }
  });
  return logQueue;
}

async function getPairs() {
  const data = await browser.storage.local.get(PAIRS_KEY);
  const raw = data[PAIRS_KEY] || {};
  // Normalize: storage may preserve numbers, but guard against mixed types.
  const normalized = {};
  for (const [k, v] of Object.entries(raw)) {
    normalized[Number(k)] = Number(v);
  }
  return normalized;
}
async function setPairs(pairs) {
  await browser.storage.local.set({[PAIRS_KEY]: pairs});
}
async function getMode() {
  const data = await browser.storage.local.get(MODE_KEY);
  return data[MODE_KEY] || 'simple';
}
async function getRouting() {
  const data = await browser.storage.local.get(ROUTING_KEY);
  return data[ROUTING_KEY] !== false;
}
async function getPausedPairs() {
  const data = await browser.storage.local.get(PAUSED_KEY);
  return new Set((data[PAUSED_KEY] || []).map(Number));
}
async function setPausedPairs(set) {
  await browser.storage.local.set({[PAUSED_KEY]: [...set]});
}

function newPairId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function markTab(tabId, marker) {
  try { 
    if (typeof browser !== 'undefined' && browser.sessions && browser.sessions.setTabValue) {
      await browser.sessions.setTabValue(tabId, MARKER_KEY, marker); 
    }
  }
  catch (e) { console.error(e);  }
}
async function readTabMarker(tabId) {
  try { 
    if (typeof browser !== 'undefined' && browser.sessions && browser.sessions.getTabValue) {
      return (await browser.sessions.getTabValue(tabId, MARKER_KEY)) || null; 
    }
    return null;
  }
  catch (e) { return null; }
}
async function clearTabMarker(tabId) {
  try { 
    if (typeof browser !== 'undefined' && browser.sessions && browser.sessions.removeTabValue) {
      await browser.sessions.removeTabValue(tabId, MARKER_KEY); 
    }
  }
  catch (e) { console.error(e);  }
}

// Rebuild storage["pairs"] / storage["paused"] from the markers Firefox restored
// onto tabs. Called once at browser startup. Tab IDs from the previous session
// are dead by the time this runs, so the existing storage is replaced wholesale.
async function reconcilePairsFromSessions() {
  let allTabs;
  try { allTabs = await browser.tabs.query({}); }
  catch (e) { return; }

  const buckets = new Map(); // pairId -> {left?, right?, paused}
  
  // Parallelize marker reads for all tabs.
  const markers = await Promise.all(allTabs.map(t => readTabMarker(t.id)));

  for (let i = 0; i < allTabs.length; i++) {
    const t = allTabs[i];
    const m = markers[i];
    if (!m || !m.pairId || (m.side !== "left" && m.side !== "right")) continue;
    let bucket = buckets.get(m.pairId);
    if (!bucket) { bucket = {paused: false}; buckets.set(m.pairId, bucket); }
    bucket[m.side] = t.id;
    if (m.paused) bucket.paused = true;
  }

  const newPairs = {};
  const newPaused = new Set();
  const restored = [];
  const orphans = [];
  for (const [pairId, bucket] of buckets.entries()) {
    if (bucket.left != null && bucket.right != null) {
      newPairs[bucket.left] = bucket.right;
      if (bucket.paused) newPaused.add(bucket.left);
      restored.push({pairId, leftId: bucket.left, rightId: bucket.right, paused: bucket.paused});
    } else {
      const surviving = bucket.left ?? bucket.right;
      if (surviving != null) orphans.push(surviving);
    }
  }
  if (orphans.length) await Promise.all(orphans.map(clearTabMarker));

  await setPairs(newPairs);
  await setPausedPairs(newPaused);
  if (restored.length) log("bg", "info", "pair_restored", {count: restored.length, pairs: restored});
  if (orphans.length) log("bg", "info", "pair_orphan_dropped", {count: orphans.length});
  await updateBadge();
}

async function updateBadge() {
  const pairs = await getPairs();
  const count = Object.keys(pairs).length;
  const mode = await getMode();
  const routing = await getRouting();
  browser.browserAction.setBadgeText({text: count ? String(count) : ''});
  if (!routing) {
    browser.browserAction.setBadgeBackgroundColor({color: '#999'});
    browser.browserAction.setTitle({title: `Split View Router – ${count} pair(s), routing paused`});
  } else {
    browser.browserAction.setBadgeBackgroundColor({color: mode === 'simple' ? '#0a84ff' : '#9059ff'});
    browser.browserAction.setTitle({title: `Split View Router – ${count} pair(s), ${mode} mode`});
  }
}

async function updatePairSplitMenu(windowId) {
  try {
    const query = {highlighted: true};
    if (windowId != null && windowId !== browser.windows.WINDOW_ID_NONE) {
      query.windowId = windowId;
    } else {
      query.currentWindow = true;
    }

    const [highlightedTabs, pairs] = await Promise.all([
      browser.tabs.query(query),
      getPairs()
    ]);

    let alreadyPaired = false;
    if (highlightedTabs.length === 2) {
      highlightedTabs.sort((a, b) => a.index - b.index);
      const [left, right] = highlightedTabs;
      alreadyPaired = pairs[left.id] === right.id;
    }

    await browser.contextMenus.update(
      "pair-split",
      getPairSplitState(highlightedTabs.length, alreadyPaired)
    );
  } catch (e) {
    console.error(e);
    // Menu may not exist yet while the background page is waking up.
  }
}

async function updateUnpairMenus(tab) {
  try {
    const pairs = await getPairs();
    const entries = Object.entries(pairs);
    const hasPairs = entries.length > 0;
    const tabId = tab?.id;
    const isPairedTab = tabId != null && entries.some(([leftId, rightId]) =>
      Number(leftId) === tabId || rightId === tabId
    );

    await Promise.all([
      browser.contextMenus.update("unpair", getUnpairThisTabState(isPairedTab)),
      browser.contextMenus.update("unpair-all", getUnpairAllState(hasPairs))
    ]);
  } catch (e) {
    console.error(e);
    // Menu may not exist yet while the background page is waking up.
  }
}

async function updatePauseResumeMenu(tab) {
  try {
    const [pairs, paused] = await Promise.all([getPairs(), getPausedPairs()]);
    const tabId = tab?.id;
    let leftId = null;
    for (const [l, r] of Object.entries(pairs)) {
      if (Number(l) === tabId || r === tabId) { leftId = Number(l); break; }
    }

    await browser.contextMenus.update(
      "pause-resume",
      getPauseResumeMenuState(leftId !== null, leftId !== null && paused.has(leftId))
    );
  } catch (e) {
    console.error(e);
  }
}

// Recreate on every background load — event pages can be unloaded and the
// onInstalled event only fires on install/update.
async function createContextMenus() {
  await browser.contextMenus.removeAll();
  browser.contextMenus.create({id: "pair-split", title: "Pair selected tabs as split", contexts: ["tab"]});
  browser.contextMenus.create({id: "unpair", title: "Unpair this tab", contexts: ["tab"]});
  browser.contextMenus.create({id: "unpair-all", title: "Unpair all", contexts: ["tab"]});
  browser.contextMenus.create({id: "pause-resume", title: "Pause routing", contexts: ["tab"]});
  await updatePairSplitMenu();
  await updateUnpairMenus();
  await updatePauseResumeMenu();
}

browser.runtime.onInstalled.addListener(async (details) => {
  const existing = await browser.storage.local.get([MODE_KEY, ROUTING_KEY]);
  if (existing[MODE_KEY] === undefined) {
    await browser.storage.local.set({[MODE_KEY]: 'simple'});
  }
  if (existing[ROUTING_KEY] === undefined) {
    await browser.storage.local.set({[ROUTING_KEY]: true});
  }
  // After an extension update the in-memory state is fresh, but tab markers
  // from before the update are still around — rebuild from them.
  if (details && details.reason === "update") {
    await reconcilePairsFromSessions();
  }
});

browser.runtime.onStartup.addListener(async () => {
  // Stored tab IDs are stale across a browser restart. Rebuild from the
  // sessions markers Firefox carried through session restore.
  await reconcilePairsFromSessions();
});

createContextMenus();

browser.contextMenus.onClicked.addListener((info, tab) => {
  withStorageMutex(async () => {
    if (info.menuItemId === "pair-split") {
      const tabs = await browser.tabs.query({windowId: tab.windowId, highlighted: true});
      if (tabs.length !== 2) return;
      tabs.sort((a, b) => a.index - b.index);
      const [left, right] = tabs;
      const pairs = await getPairs();
      const paused = await getPausedPairs();

      const displaced = [];
      for (const [l, r] of Object.entries(pairs)) {
        const lid = Number(l);
        if (lid === left.id || r === left.id || lid === right.id || r === right.id) {
          displaced.push(lid, r);
          delete pairs[l];
          paused.delete(lid);
        }
      }
      if (displaced.length) await Promise.all(displaced.map(clearTabMarker));

      const pairId = newPairId();
      pairs[left.id] = right.id;
      // Fresh pairs always start unpaused.
      paused.delete(left.id);

      await Promise.all([
        markTab(left.id, {pairId, side: "left", paused: false}),
        markTab(right.id, {pairId, side: "right", paused: false})
      ]);
      await setPairs(pairs);
      await setPausedPairs(paused);
      log("bg", "info", "pair_added", {leftId: left.id, rightId: right.id, leftOrigin: originOf(left.url), rightOrigin: originOf(right.url)});
      await updatePairSplitMenu(tab.windowId);
      await updateUnpairMenus(tab);
    }
    if (info.menuItemId === "unpair") {
      const pairs = await getPairs();
      const paused = await getPausedPairs();
      const removed = [];
      const toClear = [];
      for (const [l, r] of Object.entries(pairs)) {
        if (Number(l) === tab.id || r === tab.id) {
          removed.push({leftId: Number(l), rightId: r});
          toClear.push(Number(l), r);
          delete pairs[l];
          paused.delete(Number(l));
        }
      }
      if (toClear.length) await Promise.all(toClear.map(clearTabMarker));
      await setPairs(pairs);
      await setPausedPairs(paused);
      if (removed.length) log("bg", "info", "pair_removed", {via: "menu", pairs: removed});
      await updatePairSplitMenu(tab.windowId);
      await updateUnpairMenus(tab);
      await updatePauseResumeMenu(tab);
    }
    if (info.menuItemId === "unpair-all") {
      const existing = await getPairs();
      const before = Object.keys(existing).length;
      const toClear = [];
      for (const [l, r] of Object.entries(existing)) {
        toClear.push(Number(l), r);
      }
      if (toClear.length) await Promise.all(toClear.map(clearTabMarker));
      await setPairs({});
      await setPausedPairs(new Set());
      log("bg", "info", "pairs_cleared", {via: "menu", count: before});
      await updatePairSplitMenu(tab.windowId);
      await updateUnpairMenus(tab);
      await updatePauseResumeMenu(tab);
    }
    if (info.menuItemId === "pause-resume") {
      const pairs = await getPairs();
      const paused = await getPausedPairs();
      let leftId = null, rightId = null;
      for (const [l, r] of Object.entries(pairs)) {
        if (Number(l) === tab.id || r === tab.id) { leftId = Number(l); rightId = r; break; }
      }
      if (leftId !== null) {
        let nowPaused;
        if (paused.has(leftId)) {
          paused.delete(leftId);
          nowPaused = false;
          log("bg", "info", "pair_resumed", {leftId});
        } else {
          paused.add(leftId);
          nowPaused = true;
          log("bg", "info", "pair_paused", {leftId});
        }
        await setPausedPairs(paused);
        // Mirror paused state into the session markers so it survives restore.
        const [leftMarker, rightMarker] = await Promise.all([
          readTabMarker(leftId),
          readTabMarker(rightId)
        ]);
        const updates = [];
        if (leftMarker) updates.push(markTab(leftId, {...leftMarker, paused: nowPaused}));
        if (rightMarker) updates.push(markTab(rightId, {...rightMarker, paused: nowPaused}));
        if (updates.length) await Promise.all(updates);
      }
      await updatePauseResumeMenu(tab);
    }
  });
});

browser.contextMenus.onShown.addListener(async (info, tab) => {
  await updatePairSplitMenu(tab?.windowId);
  await updateUnpairMenus(tab);
  await updatePauseResumeMenu(tab);
  await browser.contextMenus.refresh();
});

browser.tabs.onHighlighted.addListener(async (highlightInfo) => {
  await updatePairSplitMenu(highlightInfo.windowId);
});

browser.tabs.onActivated.addListener(async (activeInfo) => {
  await updatePairSplitMenu(activeInfo.windowId);
});

browser.windows.onFocusChanged.addListener(async (windowId) => {
  await updatePairSplitMenu(windowId);
});

browser.runtime.onMessage.addListener(async (msg, sender) => {
  if (msg.type === "cspBlocked") {
    if (sender.tab?.id) cspBlockedTabs.add(sender.tab.id);
    return true;
  }
  if (msg.type === "openInRight") {
    withStorageMutex(async () => {
      const [pairs, paused, routing] = await Promise.all([getPairs(), getPausedPairs(), getRouting()]);
      const senderId = sender.tab?.id;
      const rightId = pairs[senderId];

      if (rightId) {
        // Defense-in-depth: drop the route if the pair is paused or routing is off.
        // However, if the destination tab is GONE, we still want to proceed to the
        // catch block below to clean up the stale pair.
        if (!routing || paused.has(senderId)) {
          try {
            await browser.tabs.get(rightId);
            log("bg", "warn", "route_dropped_paused", {leftId: senderId, origin: originOf(msg.url)});
            return;
          } catch (e) { /* Right tab is gone, proceed to cleanup */ }
        }

        try {
          await browser.tabs.update(rightId, {url: msg.url, loadReplace: true});
          log("bg", "info", "routed", {leftId: senderId, rightId, origin: originOf(msg.url)});
        } catch (e) {
          delete pairs[senderId];
          paused.delete(senderId);
          await setPairs(pairs);
          await setPausedPairs(paused);
          await clearTabMarker(senderId);
          log("bg", "warn", "route_failed_right_gone", {leftId: senderId, rightId, origin: originOf(msg.url)});
        }
      } else {
        log("bg", "warn", "route_dropped_no_pair", {leftId: senderId, origin: originOf(msg.url)});
      }
    });
    return;
  }
  if (msg.type === "getMode") return getMode();
  if (msg.type === "getState") {
    const [pairs, routing, paused] = await Promise.all([getPairs(), getRouting(), getPausedPairs()]);
    const mode = await getMode();
    const tabId = sender.tab?.id;
    const isPaired = tabId != null && pairs[tabId] !== undefined;
    const enabled = isPaired && routing && !paused.has(tabId);
    const isCspBlocked = tabId != null && cspBlockedTabs.has(tabId);
    return {mode, enabled, isCspBlocked};
  }
  if (msg.type === "setMode") {
    if (msg.mode !== 'simple' && msg.mode !== 'ctrl') return false;
    const prev = await getMode();
    await browser.storage.local.set({[MODE_KEY]: msg.mode});
    if (prev !== msg.mode) log("bg", "info", "mode_changed", {from: prev, to: msg.mode});
    return true;
  }
  if (msg.type === "getRouting") return getRouting();
  if (msg.type === "setRouting") {
    const prev = await getRouting();
    await browser.storage.local.set({[ROUTING_KEY]: !!msg.enabled});
    if (prev !== !!msg.enabled) log("bg", "info", "routing_toggled", {enabled: !!msg.enabled});
    return true;
  }
  if (msg.type === "unpairAll") {
    return new Promise((resolve) => {
      withStorageMutex(async () => {
        const existing = await getPairs();
        const before = Object.keys(existing).length;
        const toClear = [];
        for (const [l, r] of Object.entries(existing)) {
          toClear.push(Number(l), r);
        }
        if (toClear.length) await Promise.all(toClear.map(clearTabMarker));
        await setPairs({});
        await setPausedPairs(new Set());
        log("bg", "info", "pairs_cleared", {via: "popup", count: before});
        resolve(true);
      });
    });
  }
  if (msg.type === "getPairs") {
    const [pairs, paused] = await Promise.all([getPairs(), getPausedPairs()]);
    const result = [];
    for (const [l, r] of Object.entries(pairs)) {
      try {
        const [leftTab, rightTab] = await Promise.all([
          browser.tabs.get(Number(l)),
          browser.tabs.get(r)
        ]);
        result.push({leftId: Number(l), rightId: r, leftTitle: leftTab.title, rightTitle: rightTab.title, paused: paused.has(Number(l))});
      } catch (e) { console.error(e);  }
    }
    return result;
  }
  if (msg.type === "logEvent") {
    const VALID_LVLS = ["info", "warn", "err"];
    if (!VALID_LVLS.includes(msg.lvl) || typeof msg.msg !== "string") return false;
    const data = msg.data || {};
    if (sender.tab?.id != null) data.tabId = sender.tab.id;
    log("cs", msg.lvl, msg.msg, data);
    return true;
  }
  if (msg.type === "getDiagnostics") {
    const [pairsObj, routing, paused, mode, logging, stored] = await Promise.all([
      getPairs(),
      getRouting(),
      getPausedPairs(),
      getMode(),
      getLogging(),
      browser.storage.local.get(LOG_KEY)
    ]);
    const pairs = [];
    for (const [l, r] of Object.entries(pairsObj)) {
      let leftTitle = null, rightTitle = null;
      try {
        const [lt, rt] = await Promise.all([browser.tabs.get(Number(l)), browser.tabs.get(r)]);
        leftTitle = lt.title;
        rightTitle = rt.title;
      } catch (e) { console.error(e);  }
      pairs.push({leftId: Number(l), rightId: r, leftTitle, rightTitle, paused: paused.has(Number(l))});
    }
    const manifest = browser.runtime.getManifest();
    const rawLog = stored[LOG_KEY] || [];
    return {
      generatedAt: new Date().toISOString(),
      extension: {name: manifest.name, version: manifest.version},
      browser: {userAgent: navigator.userAgent, platform: navigator.platform},
      state: {mode, routing, logging, pairs},
      log: rawLog.map(e => ({ts: new Date(e.t).toISOString(), ...e}))
    };
  }
  if (msg.type === "clearLog") {
    await browser.storage.local.set({[LOG_KEY]: []});
    return true;
  }
  if (msg.type === "getLogging") return getLogging();
  if (msg.type === "setLogging") {
    const prev = await getLogging();
    const next = !!msg.enabled;
    if (prev !== next) {
      if (next) {
        await browser.storage.local.set({[LOGGING_KEY]: true});
        log("bg", "info", "logging_toggled", {enabled: true});
      } else {
        // Log the off-event before flipping the flag so it lands in the buffer.
        await log("bg", "info", "logging_toggled", {enabled: false});
        await browser.storage.local.set({[LOGGING_KEY]: false});
      }
    }
    return true;
  }
});

browser.tabs.onRemoved.addListener((id) => {
  cspBlockedTabs.delete(id);
  withStorageMutex(async () => {
    const pairs = await getPairs();
    const paused = await getPausedPairs();
    const removed = [];
    const survivors = [];
    for (const [l, r] of Object.entries(pairs)) {
      const lid = Number(l);
      if (lid === id || r === id) {
        removed.push({leftId: lid, rightId: r, closedSide: lid === id ? "left" : "right"});
        survivors.push(lid === id ? r : lid);
        delete pairs[l];
        paused.delete(lid);
      }
    }
    if (removed.length) {
      await Promise.all(survivors.map(clearTabMarker));
      await setPairs(pairs);
      await setPausedPairs(paused);
      log("bg", "info", "pair_auto_removed", {pairs: removed});
    }
  });
});

browser.commands.onCommand.addListener(async (command) => {
  if (command === "toggle-mode") {
    const current = await getMode();
    const next = current === 'simple' ? 'ctrl' : 'simple';
    await browser.storage.local.set({[MODE_KEY]: next});
    log("bg", "info", "mode_changed", {from: current, to: next, via: "shortcut"});
  }
});

// Refresh badge only when state-relevant keys change (skip log writes).
browser.storage.onChanged.addListener((changes) => {
  if (changes[PAIRS_KEY] || changes[MODE_KEY] || changes[ROUTING_KEY] || changes[PAUSED_KEY]) {
    updateBadge();
  }
});

updateBadge();
