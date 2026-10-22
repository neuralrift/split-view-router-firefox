// Shared Playwright harness: a local fixture server and a Chromium persistent
// context with the unpacked extension loaded.
import { test as base, chromium } from '@playwright/test';
import http from 'http';
import fs from 'fs';
import path from 'path';

const extensionPath = path.resolve(__dirname, '../..');
const fixtureDir = path.join(__dirname, 'fixtures');

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const file = path.join(fixtureDir, new URL(req.url, 'http://x').pathname);
      if (!file.startsWith(fixtureDir) || !fs.existsSync(file)) {
        res.writeHead(404); res.end('not found'); return;
      }
      res.writeHead(200, {'content-type': 'text/html; charset=utf-8'});
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

export const test = base.extend({
  // eslint-disable-next-line no-empty-pattern
  server: [async ({}, use) => {
    const server = await startServer();
    await use({origin: `http://127.0.0.1:${server.address().port}`});
    server.close();
  }, {scope: 'worker'}],

  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      headless: true,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    });
    await use(context);
    await context.close();
  },

  worker: async ({context}, use) => {
    let [sw] = context.serviceWorkers();
    if (!sw) sw = await context.waitForEvent('serviceworker');
    await use(sw);
  },

  extensionId: async ({worker}, use) => {
    await use(new URL(worker.url()).host);
  },

  // Chrome offers no API to create a split view, so the test overlays
  // splitViewId on the tabs the service worker reads. Everything else
  // (content scripts, messaging, tabs.update) is real.
  split: async ({worker}, use) => {
    await worker.evaluate(() => {
      self.__fakeSplits = {};
      const realQuery = chrome.tabs.query.bind(chrome.tabs);
      const realGet = chrome.tabs.get.bind(chrome.tabs);
      const overlay = (t) => (t && t.id in self.__fakeSplits ? {...t, splitViewId: self.__fakeSplits[t.id]} : t);
      chrome.tabs.query = async (q) => (await realQuery(q)).map(overlay);
      chrome.tabs.get = async (id) => overlay(await realGet(id));
    });
    const tabIdOf = (page) => worker.evaluate(async (url) => {
      const tabs = await chrome.tabs.query({});
      return tabs.find((t) => t.url === url).id;
    }, page.url());
    await use({
      async make(left, right, splitViewId = 42) {
        const ids = [await tabIdOf(left), await tabIdOf(right)];
        await worker.evaluate(([l, r, s]) => {
          self.__fakeSplits = {[l]: s, [r]: s};
          scheduleBroadcast();
        }, [...ids, splitViewId]);
        return {leftId: ids[0], rightId: ids[1], splitViewId};
      },
      async clear() {
        await worker.evaluate(() => { self.__fakeSplits = {}; scheduleBroadcast(); });
      },
      async send(msg) {
        return worker.evaluate((m) => handle(m, {}), msg);
      },
    });
  },
});

export { expect } from '@playwright/test';
