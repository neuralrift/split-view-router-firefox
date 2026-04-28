# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [1.1.0] — 2026-04-28

### Added
- **Pairs persist across browser restart.** When Firefox restores the previous session, pairs are rebuilt automatically from per-tab markers stored via `browser.sessions.setTabValue`. Pause state persists too. Mid-session reopens (Ctrl+Shift+T, History) intentionally do *not* re-pair — matches Edge's split-view behavior.
- New diagnostic log events: `pair_restored`, `pair_orphan_dropped`.

### Changed
- Adds the `sessions` permission to enable per-tab metadata persistence.

## [1.0.0] — 2026-04-28

### Added
- Pair any two highlighted tabs as a left/right split via right-click menu.
- Routes link clicks from the left tab to the right tab according to the selected mode.
- Two routing modes:
  - **Simple** (default) — plain click routes; Ctrl+click opens a new tab as normal.
  - **Ctrl** — Ctrl+click routes; plain click navigates left as normal.
- Multiple independent pairs supported in the same window.
- Per-pair pause/resume from the tab context menu.
- Routing kill-switch in the toolbar popup.
- Toolbar badge shows active pair count and mode (blue = Simple, purple = Ctrl, gray = paused).
- `window.open` and `target="_blank"` interception so document viewers and JS-driven popups route to the right tab.
- Keyboard shortcut to toggle mode (`toggle-mode` command).
- Auto-cleanup of pairs when a paired tab is closed.
- **Diagnostics page** in `about:addons` → Preferences:
  - 50-event ring-buffer log of pair, route, mode, and CSP events.
  - Copy-to-clipboard of a JSON diagnostics blob (extension version, browser UA, current state, recent events).
  - Clear-log button.
  - Stop/Start debugging toggle to pause log collection without clearing existing entries.
  - URL origins are logged (not full URLs) to avoid leaking tokens or query strings.

### Notes
- Requires Firefox 149+ (split tab GA). 146–148 users can install from source if they have Firefox's split tab feature enabled via `about:config`.
- Pairings are session-scoped; cleared on browser restart by design.
