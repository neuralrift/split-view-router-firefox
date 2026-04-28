// content.js — intercepts link clicks and window.open in left split tabs
(async () => {
  const api = typeof browser !== "undefined" ? browser : chrome;

  let mode = 'simple';
  let enabled = false;
  let routeArmed = false;
  let activeRouteUntil = 0;
  let clearRouteTimer = 0;
  
  const SVR_TOKEN = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));

  const logEvent = (lvl, msg, data) => {
    try { api.runtime.sendMessage({type: "logEvent", lvl, msg, data: data || null}).catch((e) => { console.error("[SVR] send log error:", e); }); } catch (e) { console.error("[SVR] log exception:", e); }
  };

  function syncPageState() {
    const root = document.documentElement;
    if (!root) return;
    root.setAttribute('data-svr-enabled', String(enabled));
    root.setAttribute('data-svr-mode', mode);
  }

  function clearRouteIntent() {
    routeArmed = false;
    activeRouteUntil = 0;
    if (clearRouteTimer) {
      clearTimeout(clearRouteTimer);
      clearRouteTimer = 0;
    }
  }

  async function refreshState() {
    try {
      const state = await api.runtime.sendMessage({type: "getState"});
      if (state) { mode = state.mode; enabled = state.enabled; }
    } catch (e) { console.error(e);  }
    syncPageState();
    if (!enabled) clearRouteIntent();
  }
  await refreshState();

  // Re-fetch state whenever pairs or mode change in storage.
  api.storage.onChanged.addListener((ch) => {
    if (ch.pairs || ch.mode || ch.routing || ch.paused) refreshState();
  });

  const shouldRoute = (e) => {
    if (!enabled || e.defaultPrevented) return false;
    const mod = e.ctrlKey || e.metaKey || e.shiftKey || e.altKey;
    return mode === 'simple' ? (!mod && e.button === 0) : (e.ctrlKey || e.metaKey);
  };

  const route = (url, e) => {
    if (!url || !url.startsWith('http')) return;
    if (e) { e.preventDefault(); e.stopPropagation(); }
    api.runtime.sendMessage({type: "openInRight", url}).catch(() => {});
  };

  function armRouteIntent(e) {
    if (!e.isTrusted || !shouldRoute(e)) {
      clearRouteIntent();
      return;
    }

    routeArmed = true;
    activeRouteUntil = Date.now() + 400;

    if (clearRouteTimer) clearTimeout(clearRouteTimer);
    clearRouteTimer = setTimeout(clearRouteIntent, 450);
  }

  document.addEventListener('pointerdown', (e) => {
    armRouteIntent(e);
  }, true);

  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href]');
    if (!a || a.hasAttribute('download') || !enabled) return;
    if (shouldRoute(e)) {
      clearRouteIntent();
      route(a.href, e);
    } else {
      clearRouteIntent();
    }
  }, true);

  // Inject a page-world override of window.open so doc viewers and JS-driven popups can be routed.
  // Only intercepts when a fresh route intent is armed; otherwise delegates to the native implementation.
  // Note: pages with strict CSP (no inline scripts) will block this; clicks on <a> still work.
  try {
    const s = document.createElement('script');
    s.textContent = `(() => {
      const originalOpen = window.open;
      const TOKEN = "${SVR_TOKEN}";

      window.open = function(u, name, specs) {
        try {
          const root = document.documentElement;
          const isEnabled = root.getAttribute('data-svr-enabled') === 'true';

          if (isEnabled) {
            window.postMessage({__svr: 1, u: String(u), t: TOKEN}, '*');
            let closed = false;
            setTimeout(() => { closed = true; }, 50);
            return {
              focus() {},
              close() { closed = true; },
              get closed() { return closed; }
            };
          }
        } catch (e) { console.error(e); }

        return originalOpen.apply(this, arguments);
      };
      window.__svr_installed = true;
    })();`;
    (document.documentElement || document.head).appendChild(s);
    s.remove();

    // CSP blocks script injection without necessarily throwing. Check for our marker.
    if (!window.__svr_installed) {
      throw new Error("Script execution blocked");
    }
    delete window.__svr_installed;
  } catch (e) {
    console.warn('[Split View Router] CSP blocked window.open override — only <a> clicks will be routed on this page');
    logEvent("warn", "csp_blocked_window_open", {origin: originOf(location.href)});
    try { api.runtime.sendMessage({type: "cspBlocked"}).catch(() => {}); } catch(err) { console.error("[SVR] send cspBlocked failed:", err); }
  }

  window.addEventListener('message', (e) => {
    if (e.source !== window) return;
    if (!e.data || !e.data.__svr) return;
    if (e.data.t !== SVR_TOKEN) return; // Security validation
    if (!enabled) return;
    if (!routeArmed) return;
    if (Date.now() > activeRouteUntil) {
      clearRouteIntent();
      logEvent("info", "window_open_dropped_stale", {origin: originOf(e.data.u)});
      return;
    }

    clearRouteIntent();
    logEvent("info", "window_open_routed", {origin: originOf(e.data.u)});
    route(e.data.u);
  });

  window.addEventListener('blur', clearRouteIntent);
})();
