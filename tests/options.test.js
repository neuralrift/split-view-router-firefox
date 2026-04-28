import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

const optionsHtml = fs.readFileSync(path.join(__dirname, '../options.html'), 'utf8');
const optionsJs = fs.readFileSync(path.join(__dirname, '../options.js'), 'utf8');

const flushMicrotasks = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

describe('options.js', () => {
  const defaultDiag = {
    generatedAt: new Date().toISOString(),
    extension: { name: 'SVR', version: '1.1.0' },
    browser: { userAgent: 'test-ua' },
    state: { mode: 'simple', routing: true, logging: true, pairs: [] },
    log: []
  };

  beforeEach(async () => {
    global.__resetBrowserMock();
    document.body.innerHTML = optionsHtml;
    
    // Mock clipboard
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(true) },
      configurable: true
    });

    // Default handlers
    browser.runtime.onMessage.addListener((msg) => {
      if (msg.type === "getDiagnostics") return defaultDiag;
      return undefined;
    });

    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('O1: renderState writes rows', async () => {
    eval(optionsJs);
    await flushMicrotasks();

    const state = document.getElementById('state');
    expect(state.textContent).toContain('SVR v1.1.0');
    expect(state.textContent).toContain('simple');
    expect(state.textContent).toContain('On');
  });

  it('O2: Pair rows include titles and IDs', async () => {
    browser.runtime.onMessage._fns.clear();
    browser.runtime.onMessage.addListener((msg) => {
      if (msg.type === "getDiagnostics") return {
        ...defaultDiag,
        state: { ...defaultDiag.state, pairs: [
          { leftId: 10, rightId: 20, leftTitle: 'L1', rightTitle: 'R1', paused: true }
        ]}
      };
    });

    eval(optionsJs);
    await flushMicrotasks();

    const state = document.getElementById('state');
    expect(state.textContent).toContain('L1 → R1');
    expect(state.textContent).toContain('IDs 10 → 20');
    expect(state.textContent).toContain('paused');
  });

  it('O3: renderLog empty case', async () => {
    eval(optionsJs);
    await flushMicrotasks();

    const log = document.getElementById('log');
    expect(log.textContent).toContain('No events recorded yet.');
  });

  it('O4-O5: renderLog displays entries newest-first and formats time', async () => {
    browser.runtime.onMessage._fns.clear();
    browser.runtime.onMessage.addListener((msg) => {
      if (msg.type === "getDiagnostics") return {
        ...defaultDiag,
        log: [
          { t: 1000, src: 'bg', lvl: 'info', msg: 'first' },
          { t: 2000, src: 'bg', lvl: 'info', msg: 'second' }
        ]
      };
    });

    eval(optionsJs);
    await flushMicrotasks();

    const log = document.getElementById('log');
    const rows = log.querySelectorAll('.row-log');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('second'); // Newest first
    expect(rows[1].textContent).toContain('first');
    expect(rows[0].querySelector('.ts').textContent).toMatch(/\[\d{2}:\d{2}:\d{2}\.\d{3}\]/);
  });

  it('O6: #clear button sends clearLog', async () => {
    eval(optionsJs);
    await flushMicrotasks();

    document.getElementById('clear').click();
    await flushMicrotasks();
    expect(browser.runtime.sendMessage).toHaveBeenCalledWith({ type: 'clearLog' });
  });

  it('O7: #refresh button re-fetches', async () => {
    eval(optionsJs);
    await flushMicrotasks();
    vi.mocked(browser.runtime.sendMessage).mockClear();

    document.getElementById('refresh').click();
    await flushMicrotasks();
    expect(browser.runtime.sendMessage).toHaveBeenCalledWith({ type: 'getDiagnostics' });
  });

  it('O8: #toggle-logging flips state', async () => {
    eval(optionsJs);
    await flushMicrotasks();

    const btn = document.getElementById('toggle-logging');
    btn.click();
    await flushMicrotasks();
    expect(browser.runtime.sendMessage).toHaveBeenCalledWith({ type: 'setLogging', enabled: false });
  });

  it('O9: #copy writes to clipboard', async () => {
    eval(optionsJs);
    await flushMicrotasks();

    document.getElementById('copy').click();
    await flushMicrotasks();
    expect(navigator.clipboard.writeText).toHaveBeenCalled();
    expect(document.getElementById('toast').classList.contains('show')).toBe(true);
  });

  it('O10: #copy falls back to copyViaTextarea', async () => {
    navigator.clipboard.writeText.mockRejectedValue(new Error('denied'));
    // Mock execCommand
    document.execCommand = vi.fn().mockReturnValue(true);

    eval(optionsJs);
    await flushMicrotasks();

    document.getElementById('copy').click();
    await flushMicrotasks();
    expect(document.execCommand).toHaveBeenCalledWith('copy');
  });

  it('O11: storage.onChanged triggers refresh', async () => {
    eval(optionsJs);
    await flushMicrotasks();
    vi.mocked(browser.runtime.sendMessage).mockClear();

    const onStorageChanged = [...browser.storage.onChanged._fns][0];
    onStorageChanged({ pairs: { newValue: {} } });
    
    await flushMicrotasks();
    expect(browser.runtime.sendMessage).toHaveBeenCalledWith({ type: 'getDiagnostics' });
  });

  it('O12: getDiagnostics rejection renders error', async () => {
    browser.runtime.onMessage._fns.clear();
    browser.runtime.onMessage.addListener((msg) => {
      if (msg.type === "getDiagnostics") throw new Error('fail');
    });

    eval(optionsJs);
    await flushMicrotasks();

    const state = document.getElementById('state');
    expect(state.textContent).toContain('Error: fail');
  });
});
