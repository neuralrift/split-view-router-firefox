import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

const utilCode = fs.readFileSync(path.join(__dirname, '../lib/util.js'), 'utf8');
eval(utilCode + '\nglobal.originOf = originOf; window.originOf = originOf;');

let contentCodeRaw = fs.readFileSync(path.join(__dirname, '../content.js'), 'utf8');
// Bypass isTrusted checks for tests by default, and expose SVR_TOKEN for testing.
// Also disable the CSP marker check because JSDOM doesn't execute the injected script.
let contentCode = contentCodeRaw
  .replace(/!e\.isTrusted/g, 'false')
  .replace(/const SVR_TOKEN = .*;/, 'const SVR_TOKEN = "test-token"; window.__SVR_TOKEN_FOR_TEST = SVR_TOKEN;')
  .replace(/if \(!window\.__svr_installed\) \{/, 'if (false && !window.__svr_installed) {');

const flushMicrotasks = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

describe('content.js', () => {
  beforeEach(async () => {
    global.__resetBrowserMock();
    document.documentElement.innerHTML = '';
    document.body.innerHTML = '';
    delete window.__SVR_TOKEN_FOR_TEST;

    // innerHTML='' doesn't clear attributes
    for (const a of [...document.documentElement.attributes]) {
      document.documentElement.removeAttribute(a.name);
    }

    // Mock the state returned by background
    browser.runtime.sendMessage.mockImplementation(async (msg) => {
      if (msg.type === "getState") {
        return { mode: 'simple', enabled: true, isCspBlocked: false };
      }
      return true;
    });

    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('injects SVR_TOKEN and state into document element', async () => {
    eval(contentCode);
    await flushMicrotasks();

    expect(document.documentElement.getAttribute('data-svr-enabled')).toBe('true');
    expect(document.documentElement.getAttribute('data-svr-mode')).toBe('simple');
    // Token is no longer in DOM for security
    expect(document.documentElement.hasAttribute('data-svr-token')).toBe(false);
    expect(window.__SVR_TOKEN_FOR_TEST).toBe('test-token');
  });

  it('arms route intent on pointerdown', async () => {
    eval(contentCode);
    await flushMicrotasks();

    const event = new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 });
    // MouseEvent isTrusted is false in JSDOM, but contentCode has been patched to bypass it for standard tests
    document.dispatchEvent(event);

    const a = document.createElement('a');
    a.href = 'https://example.com/target';
    document.body.appendChild(a);

    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    a.dispatchEvent(clickEvent);

    expect(browser.runtime.sendMessage).toHaveBeenCalledWith({
      type: "openInRight",
      url: "https://example.com/target"
    });
  });

  it('C1: Ctrl mode: plain click does not route; Ctrl+click does route', async () => {
    // Return ctrl mode
    browser.runtime.sendMessage.mockImplementation(async (msg) => {
      if (msg.type === "getState") return { mode: 'ctrl', enabled: true, isCspBlocked: false };
      return true;
    });

    eval(contentCode);
    await flushMicrotasks();
    vi.mocked(browser.runtime.sendMessage).mockClear();

    const a = document.createElement('a');
    a.href = 'https://example.com/ctrl-test';
    document.body.appendChild(a);

    // Plain click (should not route in ctrl mode)
    const click1 = new MouseEvent('click', { bubbles: true, button: 0 });
    a.dispatchEvent(click1);
    expect(vi.mocked(browser.runtime.sendMessage).mock.calls.some(c => c[0].type === 'openInRight')).toBe(false);

    // Ctrl+click (should route)
    const pd = new MouseEvent('pointerdown', { bubbles: true, button: 0, ctrlKey: true });
    document.dispatchEvent(pd);
    const click2 = new MouseEvent('click', { bubbles: true, button: 0, ctrlKey: true });
    a.dispatchEvent(click2);
    expect(browser.runtime.sendMessage).toHaveBeenCalledWith({ type: 'openInRight', url: 'https://example.com/ctrl-test' });
  });

  it('C2: <a download> link does not route', async () => {
    eval(contentCode);
    await flushMicrotasks();
    vi.mocked(browser.runtime.sendMessage).mockClear();

    const a = document.createElement('a');
    a.href = 'https://example.com/file.zip';
    a.setAttribute('download', '');
    document.body.appendChild(a);

    const pd = new MouseEvent('pointerdown', { bubbles: true, button: 0 });
    document.dispatchEvent(pd);
    const click = new MouseEvent('click', { bubbles: true, button: 0 });
    a.dispatchEvent(click);

    expect(vi.mocked(browser.runtime.sendMessage).mock.calls.some(c => c[0].type === 'openInRight')).toBe(false);
  });

  it('C3: When enabled === false, click does not route', async () => {
    browser.runtime.sendMessage.mockImplementation(async (msg) => {
      if (msg.type === "getState") return { mode: 'simple', enabled: false, isCspBlocked: false };
      return true;
    });

    eval(contentCode);
    await flushMicrotasks();
    vi.mocked(browser.runtime.sendMessage).mockClear();

    const a = document.createElement('a');
    a.href = 'https://example.com/disabled';
    document.body.appendChild(a);

    const pd = new MouseEvent('pointerdown', { bubbles: true, button: 0 });
    document.dispatchEvent(pd);
    const click = new MouseEvent('click', { bubbles: true, button: 0 });
    a.dispatchEvent(click);

    expect(vi.mocked(browser.runtime.sendMessage).mock.calls.some(c => c[0].type === 'openInRight')).toBe(false);
  });

  it('C4: Non-http URLs are not routed', async () => {
    eval(contentCode);
    await flushMicrotasks();
    vi.mocked(browser.runtime.sendMessage).mockClear();

    const a = document.createElement('a');
    a.href = 'mailto:test@example.com';
    document.body.appendChild(a);

    const pd = new MouseEvent('pointerdown', { bubbles: true, button: 0 });
    document.dispatchEvent(pd);
    const click = new MouseEvent('click', { bubbles: true, button: 0 });
    a.dispatchEvent(click);

    expect(vi.mocked(browser.runtime.sendMessage).mock.calls.some(c => c[0].type === 'openInRight')).toBe(false);
  });

  it('C5: postMessage with e.source !== window is rejected', async () => {
    eval(contentCode);
    await flushMicrotasks();
    vi.mocked(browser.runtime.sendMessage).mockClear();
    const token = window.__SVR_TOKEN_FOR_TEST;

    document.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));

    window.dispatchEvent(new MessageEvent('message', {
      data: { __svr: 1, u: 'https://example.com', t: token },
      source: { /* not window */ }
    }));

    expect(vi.mocked(browser.runtime.sendMessage).mock.calls.some(c => c[0].type === 'openInRight')).toBe(false);
  });

  it('C6: postMessage with no __svr field is rejected', async () => {
    eval(contentCode);
    await flushMicrotasks();
    vi.mocked(browser.runtime.sendMessage).mockClear();
    const token = window.__SVR_TOKEN_FOR_TEST;

    document.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));

    window.dispatchEvent(new MessageEvent('message', {
      data: { u: 'https://example.com', t: token },
      source: window
    }));

    expect(vi.mocked(browser.runtime.sendMessage).mock.calls.some(c => c[0].type === 'openInRight')).toBe(false);
  });

  it('C7: postMessage past activeRouteUntil is dropped', async () => {
    eval(contentCode);
    await flushMicrotasks();
    vi.mocked(browser.runtime.sendMessage).mockClear();
    const token = window.__SVR_TOKEN_FOR_TEST;

    const armTime = Date.now();
    document.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));

    // Move clock past activeRouteUntil (armTime + 400) without firing
    // the 450ms clearRouteTimer (which would set routeArmed = false).
    vi.setSystemTime(armTime + 420);

    window.dispatchEvent(new MessageEvent('message', {
      data: { __svr: 1, u: 'https://example.com', t: token },
      source: window,
    }));

    await flushMicrotasks();

    expect(vi.mocked(browser.runtime.sendMessage).mock.calls.some(c => c[0].type === 'openInRight')).toBe(false);
    expect(browser.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'logEvent', msg: 'window_open_dropped_stale' }));
  });

  it('C8: routeArmed is cleared on window.blur', async () => {
    eval(contentCode);
    await flushMicrotasks();
    vi.mocked(browser.runtime.sendMessage).mockClear();
    const token = window.__SVR_TOKEN_FOR_TEST;

    document.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
    window.dispatchEvent(new Event('blur'));

    // Should NOT route via postMessage because blur cleared it
    window.dispatchEvent(new MessageEvent('message', {
      data: { __svr: 1, u: 'https://example.com', t: token },
      source: window
    }));

    expect(vi.mocked(browser.runtime.sendMessage).mock.calls.some(c => c[0].type === 'openInRight')).toBe(false);
  });

  it('C9: Storage change triggers refreshState', async () => {
    eval(contentCode);
    await flushMicrotasks();

    browser.runtime.sendMessage.mockImplementation(async (msg) => {
      if (msg.type === "getState") return { mode: 'ctrl', enabled: true };
      return true;
    });

    // Trigger storage change
    const onStorageChanged = [...browser.storage.onChanged._fns][0];
    onStorageChanged({ mode: { newValue: 'ctrl' } });

    await flushMicrotasks();
    expect(document.documentElement.getAttribute('data-svr-mode')).toBe('ctrl');
  });

  it('C10: syncPageState writes attributes', async () => {
    eval(contentCode);
    await flushMicrotasks();
    expect(document.documentElement.getAttribute('data-svr-enabled')).toBe('true');
  });

  it('C11: CSP blocked window.open override', async () => {
    // We need to use the raw code here because the patched one disables the CSP check
    const contentWithCspCheck = contentCodeRaw
      .replace(/!e\.isTrusted/g, 'false');

    // Stub appendChild to throw for scripts
    const originalAppend = document.documentElement.appendChild;
    document.documentElement.appendChild = vi.fn((el) => {
      if (el.tagName === 'SCRIPT') throw new Error('CSP');
      return originalAppend.call(document.documentElement, el);
    });

    eval(contentWithCspCheck);
    await flushMicrotasks();

    expect(browser.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'cspBlocked' }));

    document.documentElement.appendChild = originalAppend;
  });

  it('C12: defaultPrevented event does not route', async () => {
    // Register capture listener BEFORE content.js registers its own
    document.addEventListener('click', (e) => e.preventDefault(), { capture: true });

    eval(contentCode);
    await flushMicrotasks();
    vi.mocked(browser.runtime.sendMessage).mockClear();

    const a = document.createElement('a');
    a.href = 'https://example.com';
    document.body.appendChild(a);

    document.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
    
    a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));

    expect(vi.mocked(browser.runtime.sendMessage).mock.calls.some(c => c[0].type === 'openInRight')).toBe(false);
  });

  it('C13: Untrusted event does not arm (Q6)', async () => {
    // Use raw code with isTrusted check, but still need to disable the CSP marker check for JSDOM
    const contentRawNoCsp = contentCodeRaw
      .replace(/const SVR_TOKEN = .*;/, 'const SVR_TOKEN = "test-token"; window.__SVR_TOKEN_FOR_TEST = SVR_TOKEN;')
      .replace(/if \(!window\.__svr_installed\) \{/, 'if (false && !window.__svr_installed) {');

    eval(contentRawNoCsp);
    await flushMicrotasks();
    vi.mocked(browser.runtime.sendMessage).mockClear();
    const token = window.__SVR_TOKEN_FOR_TEST;

    // MouseEvent isTrusted is false by default in JSDOM and cannot be changed easily
    const pd = new MouseEvent('pointerdown', { bubbles: true, button: 0 });
    document.dispatchEvent(pd);

    // Try to route via postMessage - should fail because pd was not trusted and didn't arm
    window.dispatchEvent(new MessageEvent('message', {
      data: { __svr: 1, u: 'https://example.com', t: token },
      source: window
    }));

    expect(vi.mocked(browser.runtime.sendMessage).mock.calls.some(c => c[0].type === 'openInRight')).toBe(false);
  });

  it('Q5: advance timers for route-intent timeout', async () => {
    eval(contentCode);
    await flushMicrotasks();
    vi.mocked(browser.runtime.sendMessage).mockClear();
    const token = window.__SVR_TOKEN_FOR_TEST;

    document.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));

    // Advance past 450ms
    vi.advanceTimersByTime(460);

    // Try to route via postMessage - should fail because timeout cleared it
    window.dispatchEvent(new MessageEvent('message', {
      data: { __svr: 1, u: 'https://example.com', t: token },
      source: window
    }));

    expect(vi.mocked(browser.runtime.sendMessage).mock.calls.some(c => c[0].type === 'openInRight')).toBe(false);
  });

  it('C14: Rapid pointerdowns update the timeout and intent', async () => {
    eval(contentCode);
    await flushMicrotasks();
    const token = window.__SVR_TOKEN_FOR_TEST;

    const t1 = 1000;
    vi.setSystemTime(t1);
    document.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));

    // Advance 200ms and click again
    vi.setSystemTime(t1 + 200);
    document.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));

    // Advance another 300ms (Total 500ms from t1, but only 300ms from last pointerdown)
    // The first intent would have expired (t1 + 400), but the second one should still be active (t1 + 200 + 400).
    vi.setSystemTime(t1 + 500);

    window.dispatchEvent(new MessageEvent('message', {
      data: { __svr: 1, u: 'https://example.com', t: token },
      source: window
    }));

    await flushMicrotasks();
    expect(browser.runtime.sendMessage).toHaveBeenCalledWith({ type: 'openInRight', url: 'https://example.com' });
  });
});
