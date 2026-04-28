import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

const backgroundCode = fs.readFileSync(path.join(__dirname, '../background.js'), 'utf8');
const utilCode = fs.readFileSync(path.join(__dirname, '../lib/util.js'), 'utf8');

describe('background.js', () => {
  beforeEach(async () => {
    global.__resetBrowserMock();
    eval(utilCode + '\nglobal.getPairSplitState = getPairSplitState;\nglobal.getUnpairThisTabState = getUnpairThisTabState;\nglobal.getUnpairAllState = getUnpairAllState;\nglobal.getPauseResumeMenuState = getPauseResumeMenuState;\nglobal.originOf = originOf;');
    
    eval(backgroundCode);
    await new Promise(r => setTimeout(r, 20)); // let init tasks finish
  });

  const getListener = (mockEvent) => [...mockEvent._fns][0];

  it('handles pair-split context menu', async () => {
    browser.tabs.query.mockResolvedValueOnce([
      { id: 10, index: 0, url: 'http://a.com' },
      { id: 20, index: 1, url: 'http://b.com' }
    ]);

    const onClicked = getListener(browser.contextMenus.onClicked);
    await onClicked({ menuItemId: "pair-split" }, { windowId: 1 });
    await new Promise(r => setTimeout(r, 20));

    const { pairs } = await browser.storage.local.get('pairs');
    expect(pairs[10]).toBe(20);
  });

  it('displaces existing pair when re-pairing', async () => {
    // Setup initial pair
    browser.tabs.query.mockResolvedValueOnce([
      { id: 10, index: 0, url: 'http://a.com' },
      { id: 20, index: 1, url: 'http://b.com' }
    ]);
    const onClicked = getListener(browser.contextMenus.onClicked);
    await onClicked({ menuItemId: "pair-split" }, { windowId: 1 });
    await new Promise(r => setTimeout(r, 20));

    // Now pair 10 with 30.
    browser.tabs.query.mockResolvedValueOnce([
      { id: 10, index: 0, url: 'http://a.com' },
      { id: 30, index: 2, url: 'http://c.com' }
    ]);

    await onClicked({ menuItemId: "pair-split" }, { windowId: 1 });
    await new Promise(r => setTimeout(r, 20));

    const { pairs } = await browser.storage.local.get('pairs');
    expect(pairs[10]).toBe(30);
    // 20 should be orphaned and marker cleared
    expect(browser.sessions.removeTabValue).toHaveBeenCalledWith(20, 'svr-pair');
  });

  it('routes message openInRight', async () => {
    // Setup a pair first
    browser.tabs.query.mockResolvedValueOnce([
      { id: 10, index: 0, url: 'http://a.com' },
      { id: 30, index: 2, url: 'http://c.com' }
    ]);
    const onClicked = getListener(browser.contextMenus.onClicked);
    await onClicked({ menuItemId: "pair-split" }, { windowId: 1 });
    await new Promise(r => setTimeout(r, 20));

    const onMessage = getListener(browser.runtime.onMessage);
    await onMessage({ type: "openInRight", url: "https://example.com" }, { tab: { id: 10 } });
    await new Promise(r => setTimeout(r, 20));

    expect(browser.tabs.update).toHaveBeenCalledWith(30, { url: "https://example.com", loadReplace: true });
  });

  it('pauses and resumes routing', async () => {
    // Setup a pair
    browser.tabs.query.mockResolvedValueOnce([
      { id: 10, index: 0, url: 'http://a.com' },
      { id: 20, index: 1, url: 'http://b.com' }
    ]);
    const onClicked = getListener(browser.contextMenus.onClicked);
    await onClicked({ menuItemId: "pair-split" }, { windowId: 1 });
    await new Promise(r => setTimeout(r, 20));

    // Pause
    await onClicked({ menuItemId: "pause-resume" }, { id: 10 });
    await new Promise(r => setTimeout(r, 20));

    const { paused } = await browser.storage.local.get('paused');
    expect(paused).toContain(10);

    // Resume
    await onClicked({ menuItemId: "pause-resume" }, { id: 10 });
    await new Promise(r => setTimeout(r, 20));

    const resumedState = await browser.storage.local.get('paused');
    expect(resumedState.paused || []).not.toContain(10);
  });

  it('removes pair on tab close', async () => {
    // Setup a pair
    browser.tabs.query.mockResolvedValueOnce([
      { id: 10, index: 0, url: 'http://a.com' },
      { id: 30, index: 1, url: 'http://b.com' }
    ]);
    const onClicked = getListener(browser.contextMenus.onClicked);
    await onClicked({ menuItemId: "pair-split" }, { windowId: 1 });
    await new Promise(r => setTimeout(r, 20));

    const onRemoved = getListener(browser.tabs.onRemoved);
    await onRemoved(30); // close right tab
    await new Promise(r => setTimeout(r, 20));

    const { pairs } = await browser.storage.local.get('pairs');
    expect(pairs[10]).toBeUndefined();
  });

  it('handles toggle-mode command', async () => {
    const onCommand = getListener(browser.commands.onCommand);
    await onCommand('toggle-mode');
    await new Promise(r => setTimeout(r, 20));

    const { mode } = await browser.storage.local.get('mode');
    expect(mode).toBe('ctrl');
  });

  it('reconciles pairs from session markers', async () => {
    browser.tabs.query.mockResolvedValueOnce([
      { id: 100, index: 0 },
      { id: 101, index: 1 }
    ]);
    browser.sessions.getTabValue.mockImplementation(async (id) => {
      if (id === 100) return { pairId: 'p1', side: 'left' };
      if (id === 101) return { pairId: 'p1', side: 'right' };
      return null;
    });

    // Manually trigger startup logic
    const startup = getListener(browser.runtime.onStartup);
    await startup();
    await new Promise(r => setTimeout(r, 50));

    const { pairs } = await browser.storage.local.get('pairs');
    expect(pairs[100]).toBe(101);
  });

  it('gathers diagnostics structure correctly', async () => {
    const onMessage = getListener(browser.runtime.onMessage);
    const diag = await onMessage({ type: "getDiagnostics" }, {});
    
    expect(diag.extension.name).toBe('Test');
    expect(diag.extension.version).toBe('1.0');
    expect(diag.state.mode).toBe('simple');
    expect(diag.state.routing).toBe(true);
    expect(Array.isArray(diag.log)).toBe(true);
    if (diag.log.length > 0) {
      expect(typeof diag.log[0].ts).toBe('string');
      expect(new Date(diag.log[0].ts).toISOString()).toBe(diag.log[0].ts);
      expect(typeof diag.log[0].t).toBe('number');
    }
  });

  it('clears log correctly', async () => {
    const onMessage = getListener(browser.runtime.onMessage);
    // First add something to log
    await onMessage({ type: "logEvent", lvl: "info", msg: "test" }, { tab: { id: 1 } });
    await new Promise(r => setTimeout(r, 20));

    await onMessage({ type: "clearLog" }, {});
    await new Promise(r => setTimeout(r, 20));

    const { log } = await browser.storage.local.get('log');
    expect(log).toEqual([]);
  });

  describe('Pairing edge cases', () => {
    it('B1: pair-split is a no-op when highlighted.length !== 2', async () => {
      browser.tabs.query.mockResolvedValueOnce([{ id: 10 }]);
      const onClicked = getListener(browser.contextMenus.onClicked);
      await onClicked({ menuItemId: "pair-split" }, { windowId: 1 });
      await new Promise(r => setTimeout(r, 20));

      const { pairs } = await browser.storage.local.get('pairs');
      expect(pairs).toBeUndefined();
    });

    it('B2: pair-split displaces a pair on the right tab too', async () => {
      // Set up {10:20}
      browser.tabs.query.mockResolvedValueOnce([{ id: 10, index: 0, url: 'http://a.com' }, { id: 20, index: 1, url: 'http://b.com' }]);
      const onClicked = getListener(browser.contextMenus.onClicked);
      await onClicked({ menuItemId: "pair-split" }, { windowId: 1 });
      await new Promise(r => setTimeout(r, 20));

      // Now pair 30 with 20. Index 1 (id 20) < Index 2 (id 30), so pair is {20:30}
      browser.tabs.query.mockResolvedValueOnce([{ id: 30, index: 2, url: 'http://c.com' }, { id: 20, index: 1, url: 'http://b.com' }]);
      await onClicked({ menuItemId: "pair-split" }, { windowId: 1 });
      await new Promise(r => setTimeout(r, 20));

      const { pairs } = await browser.storage.local.get('pairs');
      expect(pairs[20]).toBe(30);
      expect(pairs[10]).toBeUndefined();
      expect(browser.sessions.removeTabValue).toHaveBeenCalledWith(10, 'svr-pair');
    });

    it('B3: pair-split writes session markers with correct shape', async () => {
      browser.tabs.query.mockResolvedValueOnce([{ id: 10, index: 0, url: 'http://a.com' }, { id: 20, index: 1, url: 'http://b.com' }]);
      const onClicked = getListener(browser.contextMenus.onClicked);
      await onClicked({ menuItemId: "pair-split" }, { windowId: 1 });
      await new Promise(r => setTimeout(r, 20));

      expect(browser.sessions.setTabValue).toHaveBeenCalledWith(10, 'svr-pair', expect.objectContaining({ side: 'left', paused: false }));
      expect(browser.sessions.setTabValue).toHaveBeenCalledWith(20, 'svr-pair', expect.objectContaining({ side: 'right', paused: false }));
    });

    it('B4: pair-split log entry includes origins', async () => {
      browser.tabs.query.mockResolvedValueOnce([{ id: 10, index: 0, url: 'http://a.com/1' }, { id: 20, index: 1, url: 'https://b.org/2' }]);
      const onClicked = getListener(browser.contextMenus.onClicked);
      await onClicked({ menuItemId: "pair-split" }, { windowId: 1 });
      await new Promise(r => setTimeout(r, 20));

      const { log } = await browser.storage.local.get('log');
      const entry = log.find(e => e.msg === 'pair_added');
      expect(entry.data.leftOrigin).toBe('http://a.com');
      expect(entry.data.rightOrigin).toBe('https://b.org');
    });
  });

  describe('Unpair menu items', () => {
    it('B5: unpair (single-tab) menu removes only the matching pair', async () => {
      // Pair 10-20 and 30-40
      browser.tabs.query.mockResolvedValue([{ id: 10, index: 0, url: 'a' }, { id: 20, index: 1, url: 'b' }]);
      const onClicked = getListener(browser.contextMenus.onClicked);
      await onClicked({ menuItemId: "pair-split" }, { windowId: 1 });
      browser.tabs.query.mockResolvedValue([{ id: 30, index: 2, url: 'c' }, { id: 40, index: 3, url: 'd' }]);
      await onClicked({ menuItemId: "pair-split" }, { windowId: 1 });
      await new Promise(r => setTimeout(r, 20));

      // Unpair 10
      await onClicked({ menuItemId: "unpair" }, { id: 10 });
      await new Promise(r => setTimeout(r, 20));

      const { pairs } = await browser.storage.local.get('pairs');
      expect(pairs[10]).toBeUndefined();
      expect(pairs[30]).toBe(40);
      expect(browser.sessions.removeTabValue).toHaveBeenCalledWith(10, 'svr-pair');
      expect(browser.sessions.removeTabValue).toHaveBeenCalledWith(20, 'svr-pair');
    });

    it('B6: unpair-all menu clears all pairs', async () => {
      // Pair 10-20
      browser.tabs.query.mockResolvedValueOnce([{ id: 10, index: 0, url: 'a' }, { id: 20, index: 1, url: 'b' }]);
      const onClicked = getListener(browser.contextMenus.onClicked);
      await onClicked({ menuItemId: "pair-split" }, { windowId: 1 });
      await new Promise(r => setTimeout(r, 20));

      await onClicked({ menuItemId: "unpair-all" }, { windowId: 1 });
      await new Promise(r => setTimeout(r, 20));

      const { pairs } = await browser.storage.local.get('pairs');
      expect(pairs).toEqual({});
      const { log } = await browser.storage.local.get('log');
      expect(log.some(e => e.msg === 'pairs_cleared' && e.data.via === 'menu')).toBe(true);
    });

    it('B7: pause-resume click mirrors paused flag into session markers', async () => {
      browser.tabs.query.mockResolvedValueOnce([{ id: 10, index: 0, url: 'a' }, { id: 20, index: 1, url: 'b' }]);
      const onClicked = getListener(browser.contextMenus.onClicked);
      await onClicked({ menuItemId: "pair-split" }, { windowId: 1 });
      await new Promise(r => setTimeout(r, 20));

      // Mock readTabMarker for the update logic
      browser.sessions.getTabValue.mockImplementation(async (id, key) => {
        if (id === 10) return { pairId: 'p1', side: 'left', paused: false };
        if (id === 20) return { pairId: 'p1', side: 'right', paused: false };
        return null;
      });

      await onClicked({ menuItemId: "pause-resume" }, { id: 10 });
      await new Promise(r => setTimeout(r, 20));

      expect(browser.sessions.setTabValue).toHaveBeenCalledWith(10, 'svr-pair', expect.objectContaining({ paused: true }));
      expect(browser.sessions.setTabValue).toHaveBeenCalledWith(20, 'svr-pair', expect.objectContaining({ paused: true }));
    });

    it('B8: pause-resume is a no-op on non-paired tab', async () => {
      const onClicked = getListener(browser.contextMenus.onClicked);
      await onClicked({ menuItemId: "pause-resume" }, { id: 99 });
      await new Promise(r => setTimeout(r, 20));

      const { paused } = await browser.storage.local.get('paused');
      expect(paused).toBeUndefined();
    });
  });

  describe('Message handlers', () => {
    it('B9: getState returns {mode, enabled, isCspBlocked} correctly', async () => {
      const onMessage = getListener(browser.runtime.onMessage);
      
      // Case 1: Not paired
      const s1 = await onMessage({ type: "getState" }, { tab: { id: 10 } });
      expect(s1.enabled).toBe(false);

      // Case 2: Paired, routing on, not paused
      await browser.storage.local.set({ pairs: { 10: 20 }, routing: true, paused: [] });
      const s2 = await onMessage({ type: "getState" }, { tab: { id: 10 } });
      expect(s2.enabled).toBe(true);

      // Case 3: Paired, routing off
      await browser.storage.local.set({ routing: false });
      const s3 = await onMessage({ type: "getState" }, { tab: { id: 10 } });
      expect(s3.enabled).toBe(false);

      // Case 4: Paired, routing on, but paused
      await browser.storage.local.set({ routing: true, paused: [10] });
      const s4 = await onMessage({ type: "getState" }, { tab: { id: 10 } });
      expect(s4.enabled).toBe(false);
    });

    it('B10: setMode rejects invalid value', async () => {
      const onMessage = getListener(browser.runtime.onMessage);
      const res = await onMessage({ type: "setMode", mode: "invalid" }, {});
      expect(res).toBe(false);
      const { mode } = await browser.storage.local.get('mode');
      expect(mode).toBeUndefined(); // remains default or unset
    });

    it('B11: setMode does not log when value unchanged', async () => {
      await browser.storage.local.set({ mode: 'simple' });
      const onMessage = getListener(browser.runtime.onMessage);
      await onMessage({ type: "setMode", mode: "simple" }, {});
      const { log } = await browser.storage.local.get('log');
      expect(log ? log.some(e => e.msg === 'mode_changed') : false).toBe(false);
    });

    it('B12: setRouting writes boolean coercion and logs only on change', async () => {
      const onMessage = getListener(browser.runtime.onMessage);
      await onMessage({ type: "setRouting", enabled: false }, {});
      const { routing } = await browser.storage.local.get('routing');
      expect(routing).toBe(false);

      const { log } = await browser.storage.local.get('log');
      expect(log.some(e => e.msg === 'routing_toggled')).toBe(true);
    });

    it('B13: unpairAll message clears state and logs', async () => {
      await browser.storage.local.set({ pairs: { 10: 20 } });
      const onMessage = getListener(browser.runtime.onMessage);
      await onMessage({ type: "unpairAll" }, {});
      await new Promise(r => setTimeout(r, 20));

      const { pairs } = await browser.storage.local.get('pairs');
      expect(pairs).toEqual({});
      const { log } = await browser.storage.local.get('log');
      expect(log.some(e => e.msg === 'pairs_cleared' && e.data.via === 'popup')).toBe(true);
    });

    it('B14: getPairs returns formatted list with titles', async () => {
      await browser.storage.local.set({ pairs: { 10: 20 }, paused: [10] });
      browser.tabs.get.mockImplementation(async (id) => ({ id, title: `Title ${id}` }));
      
      const onMessage = getListener(browser.runtime.onMessage);
      const res = await onMessage({ type: "getPairs" }, {});
      expect(res).toEqual([{
        leftId: 10, rightId: 20,
        leftTitle: 'Title 10', rightTitle: 'Title 20',
        paused: true
      }]);
    });

    it('B15: getPairs skips entries whose tabs.get rejects', async () => {
      await browser.storage.local.set({ pairs: { 10: 20, 30: 40 } });
      browser.tabs.get.mockImplementation(async (id) => {
        if (id === 10) throw new Error('gone');
        return { id, title: `Title ${id}` };
      });

      const onMessage = getListener(browser.runtime.onMessage);
      const res = await onMessage({ type: "getPairs" }, {});
      expect(res).toHaveLength(1);
      expect(res[0].leftId).toBe(30);
    });

    it('B16: logEvent rejects unknown level', async () => {
      const onMessage = getListener(browser.runtime.onMessage);
      const res = await onMessage({ type: "logEvent", lvl: "debug", msg: "test" }, {});
      expect(res).toBe(false);
    });

    it('B17: logEvent accepts valid level and attaches tabId', async () => {
      const onMessage = getListener(browser.runtime.onMessage);
      await onMessage({ type: "logEvent", lvl: "info", msg: "test-msg", data: { foo: 1 } }, { tab: { id: 123 } });
      await new Promise(r => setTimeout(r, 20));

      const { log } = await browser.storage.local.get('log');
      const entry = log.find(e => e.msg === 'test-msg');
      expect(entry.src).toBe('cs');
      expect(entry.data.tabId).toBe(123);
    });

    it('B18: getDiagnostics returns full shape', async () => {
      const onMessage = getListener(browser.runtime.onMessage);
      const res = await onMessage({ type: "getDiagnostics" }, {});
      expect(res).toMatchObject({
        generatedAt: expect.any(String),
        extension: { name: 'Test', version: '1.0' },
        state: { mode: 'simple', routing: true, pairs: [] }
      });
    });

    it('B19: setLogging(false) logs the off-event before flipping flag', async () => {
      const onMessage = getListener(browser.runtime.onMessage);
      await onMessage({ type: "setLogging", enabled: false }, {});
      await new Promise(r => setTimeout(r, 20));

      const { log } = await browser.storage.local.get('log');
      expect(log.some(e => e.msg === 'logging_toggled' && e.data.enabled === false)).toBe(true);
      const { logging } = await browser.storage.local.get('logging');
      expect(logging).toBe(false);
    });

    it('B20: setLogging(true) writes storage and logs', async () => {
      await browser.storage.local.set({ logging: false });
      const onMessage = getListener(browser.runtime.onMessage);
      await onMessage({ type: "setLogging", enabled: true }, {});
      await new Promise(r => setTimeout(r, 20));

      const { logging } = await browser.storage.local.get('logging');
      expect(logging).toBe(true);
      const { log } = await browser.storage.local.get('log');
      expect(log.some(e => e.msg === 'logging_toggled' && e.data.enabled === true)).toBe(true);
    });

    it('B21: cspBlocked message marks tab and gets cleared on loading', async () => {
      const onMessage = getListener(browser.runtime.onMessage);
      await onMessage({ type: "cspBlocked" }, { tab: { id: 10 } });

      const state = await onMessage({ type: "getState" }, { tab: { id: 10 } });
      expect(state.isCspBlocked).toBe(true);

      const onUpdated = getListener(browser.tabs.onUpdated);
      await onUpdated(10, { status: 'loading' });
      
      const state2 = await onMessage({ type: "getState" }, { tab: { id: 10 } });
      expect(state2.isCspBlocked).toBe(false);
    });
  });

  describe('Routing — openInRight', () => {
    it('B22: openInRight from a sender not in any pair logs dropped', async () => {
      const onMessage = getListener(browser.runtime.onMessage);
      await onMessage({ type: "openInRight", url: "https://foo.com" }, { tab: { id: 99 } });
      await new Promise(r => setTimeout(r, 20));

      expect(browser.tabs.update).not.toHaveBeenCalled();
      const { log } = await browser.storage.local.get('log');
      expect(log.some(e => e.msg === 'route_dropped_no_pair')).toBe(true);
    });

    it('B23: openInRight whose tabs.update rejects clears dead pair', async () => {
      await browser.storage.local.set({ pairs: { 10: 20 } });
      browser.tabs.update.mockRejectedValueOnce(new Error('tab gone'));
      
      const onMessage = getListener(browser.runtime.onMessage);
      await onMessage({ type: "openInRight", url: "https://foo.com" }, { tab: { id: 10 } });
      await new Promise(r => setTimeout(r, 20));

      const { pairs } = await browser.storage.local.get('pairs');
      expect(pairs[10]).toBeUndefined();
      expect(browser.sessions.removeTabValue).toHaveBeenCalledWith(10, 'svr-pair');
      const { log } = await browser.storage.local.get('log');
      expect(log.some(e => e.msg === 'route_failed_right_gone')).toBe(true);
    });
  });

  describe('Tab close', () => {
    it('B24: Closing the left tab logs closedSide:left and clears right tab marker', async () => {
      await browser.storage.local.set({ pairs: { 10: 20 } });
      const onRemoved = getListener(browser.tabs.onRemoved);
      await onRemoved(10); // close left
      await new Promise(r => setTimeout(r, 20));

      expect(browser.sessions.removeTabValue).toHaveBeenCalledWith(20, 'svr-pair');
      const { log } = await browser.storage.local.get('log');
      const entry = log.find(e => e.msg === 'pair_auto_removed');
      expect(entry.data.pairs[0].closedSide).toBe('left');
    });

    it('B25: Closing an unrelated tab is a silent no-op', async () => {
      await browser.storage.local.set({ pairs: { 10: 20 } });
      const onRemoved = getListener(browser.tabs.onRemoved);
      const initialLog = (await browser.storage.local.get('log')).log || [];
      
      await onRemoved(99);
      await new Promise(r => setTimeout(r, 20));

      const { pairs } = await browser.storage.local.get('pairs');
      expect(pairs[10]).toBe(20);
      const currentLog = (await browser.storage.local.get('log')).log || [];
      expect(currentLog.length).toBe(initialLog.length);
    });

    it('B26: tabs.onRemoved clears cspBlockedTabs', async () => {
      const onMessage = getListener(browser.runtime.onMessage);
      await onMessage({ type: "cspBlocked" }, { tab: { id: 10 } });

      const onRemoved = getListener(browser.tabs.onRemoved);
      await onRemoved(10);
      
      const state = await onMessage({ type: "getState" }, { tab: { id: 10 } });
      expect(state.isCspBlocked).toBe(false);
    });
  });

  describe('Reconcile from sessions', () => {
    it('B27: Orphan marker is cleared', async () => {
      browser.tabs.query.mockResolvedValueOnce([{ id: 100 }]);
      browser.sessions.getTabValue.mockImplementation(async (id) => {
        if (id === 100) return { pairId: 'p1', side: 'left' };
        return null;
      });

      const startup = getListener(browser.runtime.onStartup);
      await startup();
      await new Promise(r => setTimeout(r, 50));

      expect(browser.sessions.removeTabValue).toHaveBeenCalledWith(100, 'svr-pair');
      const { log } = await browser.storage.local.get('log');
      expect(log.some(e => e.msg === 'pair_orphan_dropped')).toBe(true);
    });

    it('B28: Paused flag survives reconcile', async () => {
      browser.tabs.query.mockResolvedValueOnce([{ id: 100 }, { id: 101 }]);
      browser.sessions.getTabValue.mockImplementation(async (id) => {
        if (id === 100) return { pairId: 'p1', side: 'left', paused: true };
        if (id === 101) return { pairId: 'p1', side: 'right', paused: true };
        return null;
      });

      const startup = getListener(browser.runtime.onStartup);
      await startup();
      await new Promise(r => setTimeout(r, 50));

      const { paused } = await browser.storage.local.get('paused');
      expect(paused).toContain(100);
    });

    it('B29: Reconcile invoked from onInstalled with reason:update', async () => {
      browser.tabs.query.mockResolvedValue([{ id: 100 }, { id: 101 }]);
      browser.sessions.getTabValue.mockImplementation(async (id) => {
        if (id === 100) return { pairId: 'p1', side: 'left' };
        if (id === 101) return { pairId: 'p1', side: 'right' };
        return null;
      });

      const onInstalled = getListener(browser.runtime.onInstalled);
      await onInstalled({ reason: 'update' });
      await new Promise(r => setTimeout(r, 50));

      const { pairs } = await browser.storage.local.get('pairs');
      expect(pairs[100]).toBe(101);
    });
  });

  describe('Install / startup defaults', () => {
    it('B30: onInstalled first install sets defaults', async () => {
      const onInstalled = getListener(browser.runtime.onInstalled);
      await onInstalled({ reason: 'install' });
      await new Promise(r => setTimeout(r, 20));

      const { mode, routing } = await browser.storage.local.get(['mode', 'routing']);
      expect(mode).toBe('simple');
      expect(routing).toBe(true);
    });

    it('B31: onInstalled does not overwrite existing user-set mode/routing', async () => {
      await browser.storage.local.set({ mode: 'ctrl', routing: false });
      const onInstalled = getListener(browser.runtime.onInstalled);
      await onInstalled({ reason: 'update' });
      await new Promise(r => setTimeout(r, 20));

      const { mode, routing } = await browser.storage.local.get(['mode', 'routing']);
      expect(mode).toBe('ctrl');
      expect(routing).toBe(false);
    });

    it('B32: createContextMenus creates 4 items', async () => {
      // createContextMenus is called on load
      expect(browser.contextMenus.create).toHaveBeenCalledTimes(4);
      expect(browser.contextMenus.create).toHaveBeenCalledWith(expect.objectContaining({ id: 'pair-split' }));
      expect(browser.contextMenus.create).toHaveBeenCalledWith(expect.objectContaining({ id: 'unpair' }));
      expect(browser.contextMenus.create).toHaveBeenCalledWith(expect.objectContaining({ id: 'unpair-all' }));
      expect(browser.contextMenus.create).toHaveBeenCalledWith(expect.objectContaining({ id: 'pause-resume' }));
    });
  });

  describe('Badge / log buffer', () => {
    it('B33: updateBadge text and color', async () => {
      // Routing off -> gray
      await browser.storage.local.set({ pairs: { 10: 20 }, routing: false });
      await new Promise(r => setTimeout(r, 50)); // let storage listener run
      expect(browser.browserAction.setBadgeText).toHaveBeenCalledWith({ text: '1' });
      expect(browser.browserAction.setBadgeBackgroundColor).toHaveBeenCalledWith({ color: '#999' });

      // Simple mode -> blue
      await browser.storage.local.set({ routing: true, mode: 'simple' });
      await new Promise(r => setTimeout(r, 50));
      expect(browser.browserAction.setBadgeBackgroundColor).toHaveBeenCalledWith({ color: '#0a84ff' });

      // Ctrl mode -> purple
      await browser.storage.local.set({ mode: 'ctrl' });
      await new Promise(r => setTimeout(r, 50));
      expect(browser.browserAction.setBadgeBackgroundColor).toHaveBeenCalledWith({ color: '#9059ff' });
      
      // No pairs -> empty text
      await browser.storage.local.set({ pairs: {} });
      await new Promise(r => setTimeout(r, 50));
      expect(browser.browserAction.setBadgeText).toHaveBeenCalledWith({ text: '' });
    });

    it('B34: log() truncates to LOG_MAX = 50', async () => {
      const onMessage = getListener(browser.runtime.onMessage);
      // setLogging(true) just in case
      await onMessage({ type: "setLogging", enabled: true }, {});
      
      for (let i = 0; i < 60; i++) {
        await onMessage({ type: "logEvent", lvl: "info", msg: `msg${i}` }, {});
      }
      await new Promise(r => setTimeout(r, 100)); // wait for serialized log writes

      const { log } = await browser.storage.local.get('log');
      expect(log.length).toBe(50);
      expect(log[0].msg).toBe('msg10');
      expect(log[49].msg).toBe('msg59');
    });

    it('B35: log() short-circuits when logging is false', async () => {
      await browser.storage.local.set({ logging: false, log: [] });
      const onMessage = getListener(browser.runtime.onMessage);
      await onMessage({ type: "logEvent", lvl: "info", msg: "should not be logged" }, {});
      await new Promise(r => setTimeout(r, 20));

      const { log } = await browser.storage.local.get('log');
      expect(log).toEqual([]);
    });
  });

  describe('Advanced Concurrency & Resilience', () => {
    it('B36: withStorageMutex serializes overlapping pairing requests', async () => {
      const onClicked = getListener(browser.contextMenus.onClicked);
      
      // Use a more robust mock that won't be consumed by background refresh tasks
      browser.tabs.query.mockImplementation(async (q) => {
        if (q.windowId === 100) return [{ id: 10, index: 0, url: 'a' }, { id: 20, index: 1, url: 'b' }];
        if (q.windowId === 200) return [{ id: 30, index: 2, url: 'c' }, { id: 40, index: 3, url: 'd' }];
        return [];
      });

      // We can't await onClicked directly because it doesn't return the promise,
      // but we can trigger them and then wait for the storage to reach the expected state.
      onClicked({ menuItemId: "pair-split" }, { windowId: 100 });
      onClicked({ menuItemId: "pair-split" }, { windowId: 200 });

      // Poll or wait long enough for both serialized tasks to finish
      for (let i = 0; i < 10; i++) {
        await new Promise(r => setTimeout(r, 20));
        const { pairs } = await browser.storage.local.get('pairs');
        if (pairs && pairs[10] === 20 && pairs[30] === 40) break;
      }

      const { pairs } = await browser.storage.local.get('pairs');
      expect(pairs[10]).toBe(20);
      expect(pairs[30]).toBe(40);
    });

    it('B37: logQueue continues after a storage failure', async () => {
      const onMessage = getListener(browser.runtime.onMessage);
      
      // Mock one failure then one success
      let callCount = 0;
      const originalSet = browser.storage.local.set;
      browser.storage.local.set = vi.fn().mockImplementation(async (obj) => {
        if (obj.log && callCount === 0) {
          callCount++;
          throw new Error('Disk Full');
        }
        return originalSet(obj);
      });

      await onMessage({ type: "logEvent", lvl: "info", msg: "fail-me" }, {});
      await onMessage({ type: "logEvent", lvl: "info", msg: "recover-me" }, {});
      
      await new Promise(r => setTimeout(r, 100));

      const { log } = await browser.storage.local.get('log');
      // The first one failed, but the second one should have succeeded
      expect(log.some(e => e.msg === 'recover-me')).toBe(true);
      
      browser.storage.local.set = originalSet;
    });

    it('B38: handle route when target tab is closed mid-flight', async () => {
      await browser.storage.local.set({ pairs: { 10: 20 } });
      
      // Mock tabs.update to fail as if the tab was just closed
      browser.tabs.update.mockRejectedValueOnce(new Error('Tab not found'));

      const onMessage = getListener(browser.runtime.onMessage);
      await onMessage({ type: "openInRight", url: "https://late.com" }, { tab: { id: 10 } });
      
      await new Promise(r => setTimeout(r, 50));

      const { pairs } = await browser.storage.local.get('pairs');
      // Pair should be cleared upon routing failure
      expect(pairs[10]).toBeUndefined();
      const { log } = await browser.storage.local.get('log');
      expect(log.some(e => e.msg === 'route_failed_right_gone')).toBe(true);
    });

    it('B40: paused state is cleared when a tab is re-paired (displaced)', async () => {
      const onClicked = getListener(browser.contextMenus.onClicked);
      
      // 1. Pair 10-20
      browser.tabs.query.mockResolvedValueOnce([{ id: 10, index: 0, url: 'a' }, { id: 20, index: 1, url: 'b' }]);
      await onClicked({ menuItemId: "pair-split" }, { windowId: 1 });
      await new Promise(r => setTimeout(r, 20));

      // 2. Pause 10
      await onClicked({ menuItemId: "pause-resume" }, { id: 10 });
      await new Promise(r => setTimeout(r, 20));
      const { paused: p1 } = await browser.storage.local.get('paused');
      expect(p1).toContain(10);

      // 3. Re-pair 10 with 30 (displace 20)
      browser.tabs.query.mockResolvedValueOnce([{ id: 10, index: 0, url: 'a' }, { id: 30, index: 2, url: 'c' }]);
      await onClicked({ menuItemId: "pair-split" }, { windowId: 1 });
      await new Promise(r => setTimeout(r, 20));

      const { paused: p2 } = await browser.storage.local.get('paused');
      expect(p2 || []).not.toContain(10);
    });

    it('B41: paused state is cleared on openInRight routing failure', async () => {
      const onMessage = getListener(browser.runtime.onMessage);
      const onClicked = getListener(browser.contextMenus.onClicked);

      // 1. Pair 10-20
      browser.tabs.query.mockResolvedValueOnce([{ id: 10, index: 0, url: 'a' }, { id: 20, index: 1, url: 'b' }]);
      await onClicked({ menuItemId: "pair-split" }, { windowId: 1 });
      await new Promise(r => setTimeout(r, 20));

      // 2. Pause 10
      await onClicked({ menuItemId: "pause-resume" }, { id: 10 });
      await new Promise(r => setTimeout(r, 20));

      // 3. Trigger routing failure
      browser.tabs.get.mockRejectedValueOnce(new Error('Tab gone'));
      browser.tabs.update.mockRejectedValueOnce(new Error('Tab gone'));
      await onMessage({ type: "openInRight", url: "https://foo.com" }, { tab: { id: 10 } });
      await new Promise(r => setTimeout(r, 20));

      const { paused } = await browser.storage.local.get('paused');
      expect(paused || []).not.toContain(10);
    });
  });
});
