# Split View Router (Chrome)

In a Chrome split view, a link clicked in the **left** tab opens in the **right** tab.
The left page stays where it is, so a list, search result or case queue can drive the
detail pane next to it.

This is the Chrome MV3 port of the Firefox add-on. Firefox needed you to pair two tabs
by hand; Chrome has native split view, so the extension routes between the two tabs of
each split automatically.

## Requirements

- **Chrome 145 or later** (`minimum_chrome_version` in the manifest). The extension
  reads `tabs.Tab.splitViewId`, which Chrome sets on tabs in a split view (`-1` when a
  tab is not in one).
- Split view enabled in Chrome. If the tab context menu has no **Add tab to new split
  view** entry, enable it at `chrome://flags/#side-by-side` and restart.

## Install (unpacked)

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked** and select this repository folder.

Tabs that were already open are covered at once: the extension injects its click
listener into them on install and update. After pulling new code, click the reload
icon on the extension card.

## Use

1. Right-click a tab → **Add tab to new split view**, and pick the second tab.
2. Click links in the left tab. They open in the right tab.

What routes:

| Click | Simple mode (default) | Ctrl mode |
| :--- | :--- | :--- |
| Plain left click on a link | Opens in the right tab | Normal |
| Ctrl/Cmd + click | Normal (new tab) | Opens in the right tab |
| Shift/Alt + click, middle click | Normal | Normal |

- Links inside iframes route too: content scripts run in all frames, so the ServiceNow
  classic list in the `gsft_main` frame works.
- Links inside open shadow roots route too (ServiceNow workspace / Next Experience case
  pages): the anchor is found with `event.composedPath()` in a capture-phase listener.
- `target="_blank"` links and `window.open()` called right after a routable click
  (document viewers, JS popups) also go to the right tab.
- Not routed: clicks in the right tab, `javascript:` / `mailto:` links, `download`
  links, and same-page `#` links that pages use as buttons.
- If a click was taken but the split is gone (or routing turned off) by the time the
  service worker checks, the link navigates normally in the left tab instead.

## Settings

Toolbar popup:

- **Routing** on/off switch for all splits.
- **Simple / Ctrl** mode (also a keyboard shortcut you can assign at
  `chrome://extensions/shortcuts`, command *Toggle routing mode*).
- A list of current split views with **Pause / Resume** per split. Pauses last for the
  browser session.

The badge shows the number of split views: blue in Simple mode, purple in Ctrl mode,
grey when routing is off.

**Extension options** opens a diagnostics page (state, recent event log, copy/clear).
See [PRIVACY.md](PRIVACY.md) for what is stored.

## Development

```bash
npm install
npx playwright install chromium
npm test           # Vitest unit tests (lib/core.js, background.js)
npm run test:e2e   # Playwright: real Chromium with the unpacked extension loaded
```

The e2e tests launch Playwright's Chromium (`channel: 'chromium'`) with
`--load-extension`; branded Chrome no longer accepts that flag. Chrome has no API to
create a split view, so the tests overlay `splitViewId` on the tabs the service worker
reads; the content scripts, messaging and tab navigation are real.

Layout:

| File | Role |
| :--- | :--- |
| `background.js` | Service worker: finds the split partner, navigates it, pushes state to tabs |
| `content.js` | Isolated-world content script (all frames): intercepts clicks |
| `main-world.js` | Main-world content script: wraps `window.open` |
| `lib/core.js` | Pure helpers shared by both and by the unit tests |
| `popup.*`, `options.*` | Toolbar popup and diagnostics page |
