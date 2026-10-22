# Privacy Policy

**Split View Router** does not collect, store, or transmit any personal data over the network.

## What the add-on stores locally

Using `chrome.storage.local`, the extension saves:

- The **mode setting** (`"simple"` or `"ctrl"`)
- The **routing on/off state**
- A **diagnostic log buffer** of up to 50 recent events (see below)

Using `chrome.storage.session` (cleared when the browser closes), it saves the IDs of split views whose routing you paused.
Split views themselves are read from Chrome's tab list and are not stored.

This data never leaves your computer. It is not synced to any account, not transmitted to any server, and not shared with any third party.

## Diagnostic log buffer

To support troubleshooting, the add-on keeps an in-storage ring buffer of the last 50 events. Each entry contains:

- A timestamp
- An event source (`"bg"` for background, `"cs"` for content script)
- A severity (`info`, `warn`, `err`)
- A short event name (e.g., `routed`, `route_dropped`, `split_paused`)
- A small data object — typically a tab ID, a split view ID, and a URL **origin** (e.g., `https://docs.google.com`). Full URLs, paths, query strings, and tokens are **not** logged.

The buffer is capped at 50 entries; older entries are evicted automatically. You can clear it manually from `chrome://extensions` → **Split View Router** → **Extension options** → **Clear log**.

## What is in the diagnostics blob you copy

The **Copy diagnostics** button in the Preferences page assembles a JSON blob containing:

- Extension name and version
- Your browser's `userAgent` and `platform` strings (e.g., Chrome version, OS family)
- Current state: mode, routing on/off, and the current split views — including the **titles** of their tabs so a reader can tell what was split
- The contents of the diagnostic log buffer described above

This blob is placed on your clipboard. The add-on does not transmit it anywhere — it only goes wherever **you** paste it.

> **Heads up:** the blob includes the **titles** of tabs in split views. Page titles can sometimes contain document names, search queries, or other identifying text. Review the copied content before pasting it into a public bug report or chat.

## Network activity

The add-on makes **no network requests of its own**. It does not contact any analytics, telemetry, or update endpoints beyond Chrome's standard extension update mechanism.

## Permissions

| Permission | Use |
|---|---|
| `tabs` | Read tab IDs, titles and split view membership; navigate the right tab on a routed click |
| `storage` | Persist mode, routing state, paused splits, and the diagnostic log buffer locally |
| `scripting` | Inject the click listener into tabs that were already open when the extension was installed or updated |
| `http://*/*`, `https://*/*` | Run the click-interception content script on web pages |

The host permissions are used solely to listen for link clicks; routing only happens in the left tab of a Chrome split view. The add-on does not read page content, form data, cookies, or any other browsing information.

## Contact

For privacy questions or concerns, open an issue at:
https://github.com/neuralrift/split-view-router-firefox/issues
