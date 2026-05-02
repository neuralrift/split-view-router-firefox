# Split View Router

[![Version](https://img.shields.io/badge/version-1.1.0-blue.svg)](https://github.com/neuralrift/split-view-router-firefox/releases/tag/v1.1.0)
[![Firefox Add-on](https://img.shields.io/badge/Firefox-Add--on-orange.svg)](https://addons.mozilla.org/en-US/firefox/addon/split-view-router/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Privacy: No data collection](https://img.shields.io/badge/privacy-no%20data%20collection-2ea44f.svg)](PRIVACY.md)

Edge-style link routing for Firefox's built-in split tab view.

Split View Router lets you keep a source page on the left, such as search
results, documentation, issues, inboxes, or dashboards, while opening selected
links in the paired tab on the right.

[![Split View Router in Firefox split view](screenshots/promo1.png)](https://addons.mozilla.org/en-US/firefox/addon/split-view-router/)

## Quick Links

- [Install](#install)
- [How It Works](#how-it-works)
- [Usage](#usage)
- [Screenshots](#screenshots)
- [Privacy and Permissions](#privacy-and-permissions)
- [Compatibility](#compatibility)
- [Troubleshooting](#troubleshooting)
- [Development](#development)

## Install

### Mozilla Add-ons

Recommended installation:

<a href="https://addons.mozilla.org/en-US/firefox/addon/split-view-router/">
  <img src="https://blog.mozilla.org/addons/files/2015/11/get-the-addon.png" alt="Get the Add-on" width="172" height="60">
</a>

### GitHub Release

1. Download the signed `.xpi` from the [latest release](https://github.com/neuralrift/split-view-router-firefox/releases).
2. Open the downloaded file in Firefox, or drag it into a Firefox window.
3. Confirm the installation prompt.

For local development setup, see [Development](#development).

## How It Works

Split View Router creates a left/right pair between two Firefox tabs. Once
paired, link clicks from the left tab can open in the right tab without losing
your place in the source tab.

| Capability | What it does |
| :--- | :--- |
| Left-to-right routing | Opens links from the left paired tab in the right paired tab. |
| Firefox split-view workflow | Designed for Firefox's native **Split Tab** experience. |
| Multiple pairs | Runs more than one independent left/right pair in the same session. |
| Two routing modes | Uses normal clicks in **Simple** mode or Ctrl/Cmd-clicks in **Ctrl** mode. |
| Per-pair controls | Pauses, resumes, or removes individual pairs from the tab menu. |
| Global routing switch | Turns routing on or off from the toolbar popup. |
| Session restore | Rebuilds pairs and pause state after Firefox restores a session. |
| Popup and badge | Shows active pairs, current mode, and routing state from the toolbar. |
| `target="_blank"` support | Routes regular links, new-tab links, and supported `window.open()` flows. |
| Diagnostics | Copies extension state and recent debug events from the preferences page. |
| Privacy-first | Uses no analytics, accounts, remote services, or data collection. |

## Usage

1. Open two tabs.
2. Place them side by side with Firefox's native **Split Tab** feature.
3. Select both tabs in the tab strip:
   - Windows/Linux: Ctrl-click
   - macOS: Cmd-click
4. Right-click either selected tab.
5. Choose **Pair selected tabs as split**.
6. Click links in the left tab to open them in the right tab.

### Routing Modes

| Mode | Behavior |
| :--- | :--- |
| Simple | Normal left-click routes to the right tab. Ctrl/Cmd-click keeps Firefox's default behavior. |
| Ctrl | Ctrl/Cmd-click routes to the right tab. Normal left-click stays in the left tab. |

Change modes from the toolbar popup, or assign a shortcut in `about:addons`
under **Manage Extension Shortcuts**.

### Tab Actions

Right-click a tab to access Split View Router actions:

- **Pair selected tabs as split** creates a left/right pair from exactly two selected tabs.
- **Unpair this tab** removes the pair that contains the current tab.
- **Unpair all** clears every pair.
- **Pause routing** temporarily stops routing for one pair.
- **Resume routing** turns routing back on for one paused pair.

## Screenshots

| Pair tabs | Control routing | Use tab actions |
| :--- | :--- | :--- |
| ![Pair selected tabs](screenshots/promo2.png) | ![Toolbar popup showing routing controls](screenshots/promo3.png) | ![Tab context menu actions](screenshots/promo4.png) |

## Privacy and Permissions

Split View Router runs locally inside Firefox.

It does not collect analytics, create accounts, use remote services, transmit
browsing data, sell data, or share user data. See [PRIVACY.md](PRIVACY.md) for
the full privacy statement.

| Permission | Why it is needed |
| :--- | :--- |
| `tabs` | Tracks paired tabs, updates the right tab, and cleans up pairs when tabs close. |
| `storage` | Saves routing mode, pair state, pause state, and local diagnostics. |
| `sessions` | Restores pair metadata after Firefox restores a previous session. |
| `contextMenus` | Adds Pair, Unpair, Pause, and Resume actions to the tab context menu. |
| `<all_urls>` | Intercepts clicks on pages that are part of a user-created pair. |

## Compatibility

- Firefox 149 or newer is required by the signed add-on.
- Firefox's native Split Tab feature must be available in the browser.
- Internal Firefox pages such as `about:newtab`, `about:addons`, and `about:debugging` do not run content scripts, so routing is not available inside those pages.
- Some strict Content Security Policy pages may block the `window.open()` override. Regular anchor links still route where Firefox allows the content script to run.

## Troubleshooting

Use the add-on preferences page to copy extension state and recent debug events
when reporting an issue.

For version history, see [CHANGELOG.md](CHANGELOG.md).

## Development

Install dependencies:

```bash
npm install
```

Run checks:

```bash
npm test
npm run lint
npm run build
```

Useful commands:

| Command | Purpose |
| :--- | :--- |
| `npm test` | Runs the Vitest unit suite. |
| `npm run test:e2e` | Runs the Playwright smoke test. |
| `npm run lint` | Validates the extension with `web-ext lint`. |
| `npm run build` | Creates an unsigned package in `web-ext-artifacts/`. |
| `npm run start` | Launches Firefox with the extension loaded by `web-ext`. |

### Load Locally in Firefox

1. Clone this repository.
2. Open Firefox and go to `about:debugging#/runtime/this-firefox`.
3. Choose **Load Temporary Add-on...**.
4. Select this repository's `manifest.json`.

Temporary installs are unsigned, development-only, and are removed when Firefox
restarts.

## Release Notes

Current release: [v1.1.0](https://github.com/neuralrift/split-view-router-firefox/releases/tag/v1.1.0)

See [CHANGELOG.md](CHANGELOG.md) for version history.

## License

[MIT](LICENSE)
