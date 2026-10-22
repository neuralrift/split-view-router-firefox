// lib/core.js — pure helpers shared by the service worker, content script and tests.
// No chrome.* calls here, so everything is unit-testable.
(function (root) {
  const SPLIT_NONE = -1;

  function originOf(url) {
    if (!url || typeof url !== 'string') return '?';
    try {
      const u = new URL(url);
      if (u.origin === 'null') return u.protocol === 'about:' ? url : u.protocol;
      return u.origin;
    } catch (e) { return '?'; }
  }

  // Chrome reports split membership on tabs.Tab.splitViewId (Chrome 140+ API,
  // -1 when the tab is not in a split). The left tab is the one with the lower
  // index. Returns {splitViewId, role: "left"|"right", partner} or null.
  function splitInfo(tab, windowTabs) {
    const id = tab && tab.splitViewId;
    if (id == null || id === SPLIT_NONE) return null;
    const members = windowTabs
      .filter(t => t.splitViewId === id && t.windowId === tab.windowId)
      .sort((a, b) => a.index - b.index);
    if (members.length !== 2) return null;
    const [left, right] = members;
    if (left.id === tab.id) return {splitViewId: id, role: 'left', partner: right};
    if (right.id === tab.id) return {splitViewId: id, role: 'right', partner: left};
    return null;
  }

  // Group a window's tabs into [{splitViewId, left, right}] pairs.
  function listSplits(tabs) {
    const byId = new Map();
    for (const t of tabs) {
      if (t.splitViewId == null || t.splitViewId === SPLIT_NONE) continue;
      const key = `${t.windowId}:${t.splitViewId}`;
      if (!byId.has(key)) byId.set(key, []);
      byId.get(key).push(t);
    }
    const out = [];
    for (const members of byId.values()) {
      if (members.length !== 2) continue;
      members.sort((a, b) => a.index - b.index);
      out.push({splitViewId: members[0].splitViewId, windowId: members[0].windowId, left: members[0], right: members[1]});
    }
    return out;
  }

  // Does this click follow the routing mode? Simple: plain left click.
  // Ctrl: Ctrl/Cmd + left click. Middle clicks never reach "click" in Chrome.
  function clickMatchesMode(mode, e) {
    if (e.button !== 0) return false;
    if (mode === 'ctrl') return !!(e.ctrlKey || e.metaKey);
    return !(e.ctrlKey || e.metaKey || e.shiftKey || e.altKey);
  }

  // Find the clicked <a href>/<area href>. composedPath() reaches into open
  // shadow roots (ServiceNow Next Experience); e.target is retargeted to the host.
  function findAnchor(e) {
    const path = typeof e.composedPath === 'function' ? e.composedPath() : [];
    for (const node of path) {
      if (node && node.nodeType === 1 && (node.localName === 'a' || node.localName === 'area') && node.hasAttribute('href')) {
        return node;
      }
    }
    const t = e.target;
    return t && typeof t.closest === 'function' ? t.closest('a[href], area[href]') : null;
  }

  // The URL to route for an anchor, or null when the link should behave normally:
  // non-http(s) schemes (javascript:, mailto:), downloads, and same-document
  // fragment links (href="#" buttons that pages wire up with JS).
  function routableUrl(anchor, currentHref) {
    if (!anchor || anchor.hasAttribute('download')) return null;
    let url;
    try { url = new URL(anchor.href); } catch (e) { return null; }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (currentHref) {
      try {
        const cur = new URL(currentHref);
        if (url.hash !== '' || anchor.getAttribute('href').startsWith('#')) {
          const a = url.href.split('#')[0], b = cur.href.split('#')[0];
          if (a === b) return null;
        }
      } catch (e) { /* ignore */ }
    }
    return url.href;
  }

  const api = {SPLIT_NONE, originOf, splitInfo, listSplits, clickMatchesMode, findAnchor, routableUrl};
  root.SVRCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : self);
