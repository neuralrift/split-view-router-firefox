import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

const popupHtml = fs.readFileSync(path.join(__dirname, '../popup.html'), 'utf8');
const popupJs = fs.readFileSync(path.join(__dirname, '../popup.js'), 'utf8');

const flushMicrotasks = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

describe('popup.js', () => {
  beforeEach(async () => {
    global.__resetBrowserMock();
    document.body.innerHTML = popupHtml;
    
    // Default handlers
    browser.runtime.onMessage.addListener((msg) => {
      if (msg.type === "getMode") return "simple";
      if (msg.type === "getRouting") return true;
      if (msg.type === "getPairs") return [];
      return undefined;
    });

    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('P1: Empty pair list renders hint', async () => {
    eval(popupJs);
    await flushMicrotasks();

    const list = document.getElementById('list');
    expect(list.textContent).toContain('No pairs. Select 2 tabs');
  });

  it('P2: Pair list renders rows with titles and paused tag', async () => {
    // Clear default listeners so we can override
    browser.runtime.onMessage._fns.clear();
    browser.runtime.onMessage.addListener((msg) => {
      if (msg.type === "getMode") return "simple";
      if (msg.type === "getRouting") return true;
      if (msg.type === "getPairs") return [
        { leftId: 10, rightId: 20, leftTitle: 'L1', rightTitle: 'R1', paused: true }
      ];
    });

    eval(popupJs);
    await flushMicrotasks();

    const list = document.getElementById('list');
    expect(list.textContent).toContain('L1');
    expect(list.textContent).toContain('→ R1');
    expect(list.textContent).toContain('(paused)');
  });

  it('P3: Mode buttons reflect current mode', async () => {
    browser.runtime.onMessage._fns.clear();
    browser.runtime.onMessage.addListener((msg) => {
      if (msg.type === "getMode") return "ctrl";
      if (msg.type === "getRouting") return true;
      if (msg.type === "getPairs") return [];
    });

    eval(popupJs);
    await flushMicrotasks();

    const ctrlBtn = document.getElementById('ctrl');
    const simpleBtn = document.getElementById('simple');
    expect(ctrlBtn.classList.contains('active')).toBe(true);
    expect(ctrlBtn.getAttribute('aria-pressed')).toBe('true');
    expect(simpleBtn.classList.contains('active')).toBe(false);
  });

  it('P4: Routing toggle reflects state and click flips it', async () => {
    eval(popupJs);
    await flushMicrotasks();

    const toggle = document.getElementById('toggle');
    expect(toggle.classList.contains('on')).toBe(true);
    expect(toggle.querySelector('.toggle-state').textContent).toBe('On');

    // Click it
    toggle.click();
    await flushMicrotasks();
    expect(browser.runtime.sendMessage).toHaveBeenCalledWith({ type: 'setRouting', enabled: false });
  });

  it('P5: Click on #ctrl sends setMode', async () => {
    eval(popupJs);
    await flushMicrotasks();

    document.getElementById('ctrl').click();
    await flushMicrotasks();
    expect(browser.runtime.sendMessage).toHaveBeenCalledWith({ type: 'setMode', mode: 'ctrl' });
  });

  it('P6: Click on #clear sends unpairAll', async () => {
    eval(popupJs);
    await flushMicrotasks();

    document.getElementById('clear').click();
    await flushMicrotasks();
    expect(browser.runtime.sendMessage).toHaveBeenCalledWith({ type: 'unpairAll' });
  });

  it('P7: When getPairs rejects, fallback renders', async () => {
    browser.runtime.onMessage._fns.clear();
    browser.runtime.onMessage.addListener((msg) => {
      if (msg.type === "getMode") return "simple";
      if (msg.type === "getRouting") return true;
      if (msg.type === "getPairs") throw new Error('reloading');
    });

    eval(popupJs);
    await flushMicrotasks();

    const list = document.getElementById('list');
    expect(list.textContent).toContain('Extension is reloading…');
  });
});
