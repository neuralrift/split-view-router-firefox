// main-world.js — runs in the page's own JS world ("world": "MAIN"), every frame.
// Wraps window.open so JS-driven links (doc viewers, ServiceNow popups) can be
// routed. It only acts while content.js has armed a route (a routable click
// just started); otherwise the native window.open runs untouched.
// Declared as a content script, so page CSP does not block it.
(() => {
  if (window.__svrOpenPatched) return;
  Object.defineProperty(window, '__svrOpenPatched', {value: true});

  const nativeOpen = window.open;
  window.open = function (u, name, features) {
    try {
      const root = document.documentElement;
      const armedUntil = Number(root && root.getAttribute('data-svr-armed-until'));
      if (root && root.getAttribute('data-svr-enabled') === 'true' && armedUntil && Date.now() <= armedUntil) {
        const url = new URL(String(u), location.href);
        if (url.protocol === 'http:' || url.protocol === 'https:') {
          window.dispatchEvent(new CustomEvent('svr:open', {detail: url.href}));
          let closed = false;
          setTimeout(() => { closed = true; }, 50);
          return {focus() {}, blur() {}, close() { closed = true; }, get closed() { return closed; }};
        }
      }
    } catch (e) { /* fall through to the native call */ }
    return nativeOpen.apply(this, arguments);
  };
})();
