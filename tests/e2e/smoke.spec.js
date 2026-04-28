import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../manifest.json'), 'utf8'));

/**
 * Creates a mock browser API string with configurable state and call tracking.
 */
function createMockApi({ mode = 'simple', routing = true, pairs = [], rejectMessages = false, logging = true, log = [] } = {}) {
  return `
    window.__svr_calls = [];
    window.browser = {
      runtime: {
        getManifest: () => (${JSON.stringify(manifest)}),
        sendMessage: async (msg) => {
          window.__svr_calls.push(msg);
          if (${rejectMessages}) throw new Error('Mock API Error');
          
          if (msg.type === "getMode") return "${mode}";
          if (msg.type === "getRouting") return ${routing};
          if (msg.type === "getPairs") return ${JSON.stringify(pairs)};
          if (msg.type === "getDiagnostics") return {
            generatedAt: new Date().toISOString(),
            extension: { name: "${manifest.name}", version: "${manifest.version}" },
            browser: { userAgent: navigator.userAgent },
            state: { mode: "${mode}", routing: ${routing}, logging: ${logging}, pairs: ${JSON.stringify(pairs)} },
            log: ${JSON.stringify(log)}
          };
          return true;
        }
      },
      storage: {
        local: {
          get: async () => ({}),
          set: async () => {}
        },
        onChanged: {
          addListener: () => {},
          removeListener: () => {}
        }
      }
    };
    window.chrome = window.browser;
  `;
}

test.describe('Popup UI', () => {
  test('renders empty state correctly', async ({ page }) => {
    await page.addInitScript(createMockApi({ pairs: [] }));
    await page.goto('http://localhost:8080/popup.html');
    
    await expect(page.locator('h3')).toContainText('Split View Router');
    await expect(page.locator('#list')).toContainText('No pairs');
  });

  test('renders active pairs correctly', async ({ page }) => {
    const pairs = [{ leftId: 10, rightId: 20, leftTitle: 'Google', rightTitle: 'GitHub', paused: false }];
    await page.addInitScript(createMockApi({ pairs }));
    await page.goto('http://localhost:8080/popup.html');
    
    await expect(page.locator('.pair')).toContainText('Google');
    await expect(page.locator('.pair')).toContainText('→ GitHub');
  });

  test('toggle routing updates UI and sends message', async ({ page }) => {
    await page.addInitScript(createMockApi({ routing: true }));
    await page.goto('http://localhost:8080/popup.html');
    
    const toggle = page.locator('#toggle');
    await expect(toggle).toHaveClass(/on/);
    await expect(toggle.locator('.toggle-state')).toHaveText('On');
    await expect(toggle).toHaveAttribute('aria-checked', 'true');

    await toggle.click();

    const calls = await page.evaluate(() => window.__svr_calls);
    expect(calls).toContainEqual({ type: 'getRouting' });
    expect(calls).toContainEqual({ type: 'setRouting', enabled: false });
  });

  test('mode buttons reflect state and send messages', async ({ page }) => {
    await page.addInitScript(createMockApi({ mode: 'simple' }));
    await page.goto('http://localhost:8080/popup.html');

    const simpleBtn = page.locator('#simple');
    const ctrlBtn = page.locator('#ctrl');

    await expect(simpleBtn).toHaveClass(/active/);
    await expect(ctrlBtn).not.toHaveClass(/active/);

    await ctrlBtn.click();
    
    const calls = await page.evaluate(() => window.__svr_calls);
    expect(calls).toContainEqual({ type: 'setMode', mode: 'ctrl' });
  });

  test('shows error state when background rejects', async ({ page }) => {
    await page.addInitScript(createMockApi({ rejectMessages: true }));
    await page.goto('http://localhost:8080/popup.html');

    await expect(page.locator('#list')).toContainText('Extension is reloading…');
  });
});

test.describe('Options UI', () => {
  test('renders diagnostics with dynamic version', async ({ page }) => {
    await page.addInitScript(createMockApi());
    await page.goto('http://localhost:8080/options.html');

    await expect(page.locator('h2')).toContainText('Split View Router');
    await expect(page.locator('#state')).toContainText(`${manifest.name} v${manifest.version}`);
  });

  test('renders log entries in reverse order', async ({ page }) => {
    const log = [
      { t: 1000, src: 'bg', lvl: 'info', msg: 'First event' },
      { t: 2000, src: 'bg', lvl: 'warn', msg: 'Second event' }
    ];
    await page.addInitScript(createMockApi({ log }));
    await page.goto('http://localhost:8080/options.html');

    const logRows = page.locator('.row-log');
    await expect(logRows).toHaveCount(2);
    await expect(logRows.first()).toContainText('Second event');
    await expect(logRows.first().locator('.lvl-warn')).toBeVisible();
  });

  test('clear log sends message and refreshes', async ({ page }) => {
    await page.addInitScript(createMockApi());
    await page.goto('http://localhost:8080/options.html');

    await page.locator('#clear').click();
    
    const calls = await page.evaluate(() => window.__svr_calls);
    expect(calls).toContainEqual({ type: 'clearLog' });
    expect(calls.filter(c => c.type === 'getDiagnostics').length).toBeGreaterThan(1);
  });

  test('copy diagnostics writes to clipboard', async ({ page }) => {
    await page.addInitScript(createMockApi());
    await page.goto('http://localhost:8080/options.html');

    await page.locator('#copy').click();

    await expect(page.locator('#toast')).toHaveClass(/show/);
    await expect(page.locator('#toast')).toContainText('Copied to clipboard');

    const calls = await page.evaluate(() => window.__svr_calls);
    expect(calls).toContainEqual({ type: 'getDiagnostics' });
  });

  test('shows error state when diagnostics fails', async ({ page }) => {
    await page.addInitScript(createMockApi({ rejectMessages: true }));
    await page.goto('http://localhost:8080/options.html');

    await expect(page.locator('#state')).toContainText('Error: Mock API Error');
  });
});
