# Privacy Policy

**Split View Router** does not collect, store, or transmit any personal data over the network.

## What the add-on stores locally

Using `browser.storage.local` (Firefox's local extension storage), the add-on saves:

- The **mode setting** (`"simple"` or `"ctrl"`)
- The **routing on/off state**
- The **active pair list** — a mapping of left-tab IDs to right-tab IDs for the current browser session
- The **paused-pair list** — left-tab IDs whose routing is currently paused
- A **diagnostic log buffer** of up to 50 recent events (see below)

This data never leaves your computer. It is not synced to any account, not transmitted to any server, and not shared with any third party.

## Diagnostic log buffer

To support troubleshooting, the add-on keeps an in-storage ring buffer of the last 50 events. Each entry contains:

- A timestamp
- An event source (`"bg"` for background, `"cs"` for content script)
- A severity (`info`, `warn`, `err`)
- A short event name (e.g., `pair_added`, `routed`, `csp_blocked_window_open`)
- A small data object — typically a tab ID, a pair-side ID, and a URL **origin** (e.g., `https://docs.google.com`). Full URLs, paths, query strings, and tokens are **not** logged.

The buffer is capped at 50 entries; older entries are evicted automatically. You can clear it manually from `about:addons` → **Split View Router** → **Preferences** → **Clear log**.

## What is in the diagnostics blob you copy

The **Copy diagnostics** button in the Preferences page assembles a JSON blob containing:

- Extension name and version
- Your browser's `userAgent` and `platform` strings (e.g., Firefox version, OS family)
- Current state: mode, routing on/off, and the active pair list — including the **titles** of paired tabs so a reader can tell what was paired
- The contents of the diagnostic log buffer described above

This blob is placed on your clipboard. The add-on does not transmit it anywhere — it only goes wherever **you** paste it.

> **Heads up:** the blob includes the **titles** of currently paired tabs. Page titles can sometimes contain document names, search queries, or other identifying text. Review the copied content before pasting it into a public bug report or chat.

## Network activity

The add-on makes **no network requests of its own**. It does not contact any analytics, telemetry, or update endpoints beyond Firefox's standard add-on update mechanism.

## Permissions

| Permission | Use |
|---|---|
| `tabs` | Read tab IDs/titles, navigate the right tab on a routed click, detect tab close events to clean up pairs |
| `storage` | Persist mode, routing state, pair list, paused list, and the diagnostic log buffer locally |
| `sessions` | Store a per-tab marker so pairings can be rebuilt automatically after a browser restart (survives session restore) |
| `contextMenus` | Add the right-click "Pair / Unpair / Pause" menu items to the tab strip |
| `<all_urls>` | Inject the click-interception content script on any page that the user pairs as a split tab |

The `<all_urls>` host permission is used solely to listen for link clicks in tabs the user has explicitly paired. The add-on does not read page content, form data, cookies, or any other browsing information.

## Contact

For privacy questions or concerns, open an issue at:
https://github.com/neuralrift/split-view-router-firefox/issues
