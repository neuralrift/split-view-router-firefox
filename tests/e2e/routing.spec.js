import { test, expect } from './harness.js';

async function openPair(context, server, leftPath, rightPath = '/right.html') {
  const left = await context.newPage();
  await left.goto(server.origin + leftPath);
  const right = await context.newPage();
  await right.goto(server.origin + rightPath);
  return {left, right};
}

const enabledIn = (frameOrPage) => frameOrPage.locator('html').getAttribute('data-svr-enabled');

async function waitEnabled(frameOrPage, value = 'true') {
  await expect.poll(() => enabledIn(frameOrPage)).toBe(value);
}

test('extension service worker starts without errors', async ({worker, extensionId}) => {
  expect(extensionId).toMatch(/^[a-p]{32}$/);
  const manifest = await worker.evaluate(() => chrome.runtime.getManifest());
  expect(manifest.manifest_version).toBe(3);
});

test('plain left click opens the link in the right split tab', async ({context, server, split}) => {
  const {left, right} = await openPair(context, server, '/plain.html');
  await split.make(left, right);
  await waitEnabled(left);

  await left.click('#plain');
  await expect(right).toHaveURL(`${server.origin}/target.html?from=plain`);
  expect(left.url()).toBe(`${server.origin}/plain.html`);
});

test('target=_blank links route instead of opening a new tab', async ({context, server, split}) => {
  const {left, right} = await openPair(context, server, '/plain.html');
  await split.make(left, right);
  await waitEnabled(left);
  const pagesBefore = context.pages().length;

  await left.click('#blank');
  await expect(right).toHaveURL(`${server.origin}/target.html?from=blank`);
  expect(context.pages().length).toBe(pagesBefore);
});

test('ServiceNow classic list inside the gsft_main iframe routes', async ({context, server, split}) => {
  const {left, right} = await openPair(context, server, '/list.html');
  const frame = left.frame({name: 'gsft_main'});
  await frame.waitForSelector('#inc');
  await split.make(left, right);
  await waitEnabled(frame);

  await frame.click('#inc');
  await expect(right).toHaveURL(`${server.origin}/target.html?from=list`);
  expect(frame.url()).toBe(`${server.origin}/list-frame.html`);
  // The page's own click handler never ran: the click was taken in capture phase.
  expect(await frame.getAttribute('#inc', 'data-page-handler')).toBeNull();
});

test('links inside shadow DOM (case pages) route', async ({context, server, split}) => {
  const {left, right} = await openPair(context, server, '/case.html');
  await split.make(left, right);
  await waitEnabled(left);

  await left.locator('#case-link span').click();
  await expect(right).toHaveURL(`${server.origin}/target.html?from=case`);
  expect(left.url()).toBe(`${server.origin}/case.html`);
});

test('window.open after a click routes to the right tab', async ({context, server, split}) => {
  const {left, right} = await openPair(context, server, '/plain.html');
  await split.make(left, right);
  await waitEnabled(left);
  const pagesBefore = context.pages().length;

  await left.click('#opener');
  await expect(right).toHaveURL(`${server.origin}/target.html?from=window-open`);
  expect(context.pages().length).toBe(pagesBefore);
});

test('href="#" script links keep working and are not routed', async ({context, server, split}) => {
  const {left, right} = await openPair(context, server, '/plain.html');
  await split.make(left, right);
  await waitEnabled(left);

  await left.click('#hash');
  await expect(left.locator('#hash-hits')).toHaveText('1');
  expect(right.url()).toBe(`${server.origin}/right.html`);
});

test('ctrl-click in simple mode behaves normally', async ({context, server, split}) => {
  const {left, right} = await openPair(context, server, '/plain.html');
  await split.make(left, right);
  await waitEnabled(left);

  const newPage = context.waitForEvent('page');
  await left.click('#plain', {modifiers: ['Control']});
  expect((await newPage).url()).toContain('/target.html?from=plain');
  expect(right.url()).toBe(`${server.origin}/right.html`);
  expect(left.url()).toBe(`${server.origin}/plain.html`);
});

test('middle click behaves normally', async ({context, server, split}) => {
  const {left, right} = await openPair(context, server, '/plain.html');
  await split.make(left, right);
  await waitEnabled(left);

  const newPage = context.waitForEvent('page');
  await left.click('#plain', {button: 'middle'});
  expect((await newPage).url()).toContain('/target.html?from=plain');
  expect(right.url()).toBe(`${server.origin}/right.html`);
});

test('ctrl mode routes ctrl-clicks and leaves plain clicks alone', async ({context, server, split}) => {
  const {left, right} = await openPair(context, server, '/plain.html');
  await split.send({type: 'setMode', mode: 'ctrl'});
  await split.make(left, right);
  await expect.poll(() => left.locator('html').getAttribute('data-svr-mode')).toBe('ctrl');

  await left.click('#plain', {modifiers: ['Control']});
  await expect(right).toHaveURL(`${server.origin}/target.html?from=plain`);

  await left.click('#plain');
  await expect(left).toHaveURL(`${server.origin}/target.html?from=plain`);
});

test('without a split partner the link navigates normally', async ({context, server, split}) => {
  const {left, right} = await openPair(context, server, '/plain.html');
  await split.make(left, right);
  await waitEnabled(left);
  await split.clear();
  await waitEnabled(left, 'false');

  await left.click('#plain');
  await expect(left).toHaveURL(`${server.origin}/target.html?from=plain`);
  expect(right.url()).toBe(`${server.origin}/right.html`);
});

test('a stale content script falls back to normal navigation', async ({context, server, split, worker}) => {
  const {left, right} = await openPair(context, server, '/plain.html');
  await split.make(left, right);
  await waitEnabled(left);
  // Dissolve the split without telling the content script.
  await worker.evaluate(() => { self.__fakeSplits = {}; });

  await left.click('#plain');
  await expect(left).toHaveURL(`${server.origin}/target.html?from=plain`);
  expect(right.url()).toBe(`${server.origin}/right.html`);
});

test('clicks in the right tab are not routed', async ({context, server, split}) => {
  const {left, right} = await openPair(context, server, '/plain.html');
  await split.make(left, right);
  await waitEnabled(right, 'false');

  await right.click('#right-link');
  await expect(right).toHaveURL(`${server.origin}/target.html?from=right`);
  expect(left.url()).toBe(`${server.origin}/plain.html`);
});

test('pausing the split or turning routing off stops routing', async ({context, server, split}) => {
  const {left, right} = await openPair(context, server, '/plain.html');
  const {splitViewId} = await split.make(left, right);
  await waitEnabled(left);

  await split.send({type: 'setPaused', splitViewId, paused: true});
  await waitEnabled(left, 'false');
  await split.send({type: 'setPaused', splitViewId, paused: false});
  await waitEnabled(left);

  await split.send({type: 'setRouting', enabled: false});
  await waitEnabled(left, 'false');
  await left.click('#plain');
  await expect(left).toHaveURL(`${server.origin}/target.html?from=plain`);
  expect(right.url()).toBe(`${server.origin}/right.html`);
});

test('popup lists the split and toggles pause', async ({context, server, split, extensionId}) => {
  const {left, right} = await openPair(context, server, '/plain.html');
  await split.make(left, right);
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);

  const row = popup.locator('.pair');
  await expect(row).toContainText('Plain');
  await expect(row).toContainText('→ Right');
  await row.locator('button.pause').click();
  await expect(row).toContainText('(paused)');
  await waitEnabled(left, 'false');
});

test('options page shows diagnostics with routed events', async ({context, server, split, extensionId}) => {
  const {left, right} = await openPair(context, server, '/plain.html');
  await split.make(left, right);
  await waitEnabled(left);
  await left.click('#plain');
  await expect(right).toHaveURL(/from=plain/);

  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  await expect(options.locator('#state')).toContainText('Split View Router v2.0.0');
  await expect(options.locator('#state')).toContainText('Splits');
  await expect(options.locator('#log')).toContainText('routed');
});
