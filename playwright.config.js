import { defineConfig } from '@playwright/test';

// The specs launch their own persistent Chromium context with the unpacked
// extension (see tests/e2e/fixtures.js), so no browser project is configured.
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 30_000,
  reporter: 'list',
});
