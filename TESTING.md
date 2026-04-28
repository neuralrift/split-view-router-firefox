# Testing Guide

Run the automated suite first, then perform manual smoke tests for UX-specific features.

---

## Automated Tests

Requires Node.js 18+.

```bash
npm install
npm test          # Runs Vitest unit tests (background, content, logic)
npm run test:e2e  # Runs Playwright E2E tests (requires Firefox)
```

---

## Manual Test Checklist (Smoke Test)

Catches regressions in toolbar popups and context menus.

- [ ] Extension loads via `about:debugging` → **Load Temporary Add-on…** without errors
- [ ] Toolbar icon appears; popup opens, shows "No pairs"
- [ ] Highlight 2 tabs → right-click → **Pair selected tabs as split** → pair created, badge shows **1**
- [ ] In Simple mode: plain-click a link in the left tab → opens in the **right** tab
- [ ] Toggle to Ctrl mode in popup → Ctrl+click in left tab routes to right; plain click navigates left
- [ ] Toggle **Routing** off in popup → badge turns gray; clicks no longer route
- [ ] Close the right tab → pair auto-removed; badge decrements
- [ ] Open `about:addons` → Split View Router → **Preferences** → state and log render
- [ ] **Copy diagnostics** → blob is valid JSON containing `state` and `log` keys
- [ ] `npx web-ext lint` → 0 errors, 0 warnings

---

## Behavioral Persistence (v1.1.0+)

- [ ] Set Ctrl mode → close popup → reopen → still Ctrl mode
- [ ] Pair tabs → **Restart Firefox** → **Restore Previous Session** → pairs are rebuilt automatically; routing works immediately.
- [ ] Pause a pair → Restart → **Restore** → pair is restored in **Paused** state.
- [ ] Close a single paired tab → **Ctrl+Shift+T** (Restore tab) → pairing is **not** restored (expected behavior, matches session restoration design).

---

## Full test (major changes, ~20 min)

### Pairing via context menu

- [ ] Highlight 0 tabs → menu item **disabled**
- [ ] Highlight 1 tab → disabled with hint
- [ ] Highlight 3 tabs → disabled with hint
- [ ] Highlight exactly 2 tabs → enabled, says **"Pair selected tabs as split"**
- [ ] Re-highlight the same 2 tabs → menu now says **"Selected tabs are already paired"** and is disabled

### Routing — Simple mode

- [ ] Plain-click any link in left → opens in right; left stays put
- [ ] **Ctrl+click** in left → opens in new tab (browser default), pair untouched
- [ ] **Shift+click** in left → opens in new window
- [ ] **Middle-click** in left → opens in new tab
- [ ] `<a download>` link → file downloads, no routing
- [ ] `target="_blank"` link → routes to right tab

### Routing — Ctrl mode

- [ ] Plain-click in left → navigates left tab as normal
- [ ] **Ctrl+click** in left → routes to right tab
- [ ] Badge color changes (purple in Ctrl, blue in Simple)

### window.open routing

- [ ] Permissive page (e.g., a Google Docs document viewer) — `window.open` action routes to right tab
- [ ] Strict-CSP page (e.g., github.com) — `window.open` does **not** route, but `<a>` clicks still do; Browser Console shows the CSP warning; diagnostics log shows `csp_blocked_window_open`
- [ ] OAuth flow on a paired tab: known limitation — popup stub may misbehave; unpair recovers

### Pause / resume

- [ ] Right-click on paired tab → **Pause routing** → menu changes to **Resume routing**
- [ ] Paused: link clicks navigate left tab; popup pair list shows `(paused)`
- [ ] Resume → routing works again

### Multi-pair

- [ ] Pair A↔B then C↔D → both work independently; badge shows **2**
- [ ] Re-pairing A with E (new tab) **replaces** A↔B, doesn't add a third pair

### Cleanup on tab close

- [ ] Close right tab → pair auto-removed; diagnostics shows `pair_auto_removed` with `closedSide: "right"`
- [ ] Close left tab → pair auto-removed with `closedSide: "left"`

### Mode toggle keyboard shortcut

- [ ] Set a shortcut in `about:addons` → Manage Extension Shortcuts → press it → mode flips
- [ ] Diagnostics log shows `mode_changed` with `via: "shortcut"`

### Multi-window

- [ ] Drag right tab into a new window → routing still works (cross-window navigation)
- [ ] Pair tabs in window A → window B's right-click menu reflects window B's highlighted tabs only

### Private browsing

- [ ] `about:addons` → **Run in Private Windows** OFF → extension does not load in private tabs
- [ ] Toggle ON → pair-and-route works in private windows

### Diagnostics page

- [ ] Open **about:addons** → **Split View Router** → **Preferences** → page renders successfully
- [ ] State block: extension version, mode, routing, pair list with titles + IDs
- [ ] Log block: events newest-first, color-coded by level, timestamps formatted
- [ ] **Copy diagnostics** → JSON includes `ts` (ISO) alongside `t` (raw ms)
- [ ] **Clear log** empties log, preserves state
- [ ] **Refresh** re-reads state

### Edge cases

- [ ] Iframe link click → does **not** route (`all_frames: false`)
- [ ] `javascript:` link → does not route (URL scheme guard)
- [ ] `about:newtab` paired tab → content script doesn't load there; pair created but no routing
- [ ] Reader Mode tab → content script doesn't load on `about:reader`

### AMO submission preflight

- [ ] `npx web-ext lint` → 0 errors, 0 warnings, 0 notices
- [ ] `npm run build` → produces a valid `.zip` in `web-ext-artifacts/`
- [ ] Manifest version bumped from previous release
- [ ] CHANGELOG.md entry added
- [ ] Screenshots up to date if UI changed
- [ ] PRIVACY.md still accurately describes what's stored
