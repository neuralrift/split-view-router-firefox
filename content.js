// content.js — runs in every frame (all_frames) of http(s) pages, isolated world.
// In the left tab of a split it turns link clicks into "open in the right tab".
(() => {
  const core = globalThis.SVRCore;
  const alive = () => !!(globalThis.chrome && chrome.runtime && chrome.runtime.id);

  // Skip a second copy (static injection plus the install-time injection).
  if (globalThis.__svrRouter && globalThis.__svrRouter.alive()) return;
  globalThis.__svrRouter = {alive};

  let mode = 'simple';
  let enabled = false;
  let armedUntil = 0;

  const logEvent = (lvl, msg, data) => {
    if (!alive()) return;
    chrome.runtime.sendMessage({type: 'logEvent', lvl, msg, data: data || null}).catch(() => {});
  };

  function applyState(state) {
    if (!state) return;
    mode = state.mode === 'ctrl' ? 'ctrl' : 'simple';
    enabled = !!state.enabled;
    const root = document.documentElement;
    if (root) {
      root.setAttribute('data-svr-enabled', String(enabled));
      root.setAttribute('data-svr-mode', mode);
    }
    if (!enabled) disarm();
  }

  async function refreshState() {
    if (!alive()) { enabled = false; return; }
    try { applyState(await chrome.runtime.sendMessage({type: 'getState'})); }
    catch (e) { /* worker restarting or extension reloaded */ }
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === 'svr:state') applyState(msg.state);
  });

  // window.open interception (main-world.js) only fires inside a short window
  // after a trusted pointerdown that would have routed a click.
  function arm() {
    armedUntil = Date.now() + 400;
    document.documentElement && document.documentElement.setAttribute('data-svr-armed-until', String(armedUntil));
  }
  function disarm() {
    armedUntil = 0;
    document.documentElement && document.documentElement.removeAttribute('data-svr-armed-until');
  }

  // Navigate the way the browser would have, used when routing fails after
  // we already cancelled the click.
  function navigateNormally(url, target) {
    const t = (target || '').trim();
    if (!t || t === '_self') location.assign(url);
    else window.open(url, t, t === '_blank' ? 'noopener' : '');
  }

  async function routeOrFallback(url, target) {
    let res = null;
    try { res = await chrome.runtime.sendMessage({type: 'route', url}); }
    catch (e) { res = null; }
    if (!res || !res.routed) {
      logEvent('warn', 'route_fallback', {reason: res ? res.reason : 'no_response', origin: core.originOf(url)});
      navigateNormally(url, target);
    }
  }

  window.addEventListener('pointerdown', (e) => {
    // Cheap re-check so a split made or dissolved a moment ago is known by click time.
    refreshState();
    if (e.isTrusted && enabled && alive() && core.clickMatchesMode(mode, e)) arm();
    else disarm();
  }, true);

  // Capture phase on window runs before page handlers (ServiceNow list rows
  // and Next Experience components attach their own click handlers).
  window.addEventListener('click', (e) => {
    if (!enabled || !e.isTrusted || e.defaultPrevented || !alive()) return;
    if (!core.clickMatchesMode(mode, e)) return;
    const a = core.findAnchor(e);
    if (!a) return;
    const url = core.routableUrl(a, location.href);
    if (!url) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    disarm();
    routeOrFallback(url, a.getAttribute('target'));
  }, true);

  // main-world.js reports window.open calls it swallowed.
  window.addEventListener('svr:open', (e) => {
    const url = typeof e.detail === 'string' ? e.detail : '';
    if (!enabled || !url) return;
    if (Date.now() > armedUntil) return;
    disarm();
    logEvent('info', 'window_open_routed', {origin: core.originOf(url)});
    routeOrFallback(url, '_blank');
  });

  window.addEventListener('blur', disarm);
  window.addEventListener('focus', refreshState);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshState(); });

  refreshState();
})();
