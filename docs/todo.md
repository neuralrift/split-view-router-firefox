# TODO: Future Improvements

This file tracks improvements intentionally deferred from v1.1.1 to avoid unnecessary regression risk.

## Priority guide

- `P1`: implement soon if storage/background failures recur or users report them.
- `P2`: useful resilience work, but not urgent.
- `P3`: larger architectural or platform work; defer until justified.

## P1: Runtime state fallback architecture

### Goal

Allow the extension to keep working during the current browser session if `browser.storage.local` becomes unavailable.

### Proposed model

```text
Runtime source of truth: in-memory state
Persistence: browser.storage.local, best effort
Session continuity fallback: browser.storage.session if available
Tab-pair restore: browser.sessions.setTabValue markers
Diagnostics: memory-first, storage-mirrored
```

### Requirements

- Hydrate in-memory state from `storage.local` on startup.
- If hydration fails, initialize safe defaults in memory.
- All normal reads use memory after hydration.
- All writes update memory first, then persist best-effort.
- Popup should still show current in-memory pairs.
- Popup should show a compact warning when persistence is unavailable:

```text
Storage unavailable — using temporary session state.
```

### Risks

- More complex state synchronization.
- Event-page unloading can lose memory if background remains non-persistent.
- Needs careful tests for storage changes, tab close cleanup, and restart restore.

## P1: Storage schema validation and auto-repair

### Goal

Repair malformed individual keys without clearing all extension data.

### Auto-repair candidates

- `log` is not an array: reset `log` only.
- `pairs` is not an object: reset `pairs` only.
- `paused` is not an array: reset `paused` only.
- `mode` is not `simple` or `ctrl`: reset to `simple`.
- `routing` is not boolean-compatible: reset to `true`.

### Constraints

- Do not auto-clear all extension data.
- Log repair events to memory first.
- Report repairs in diagnostics.

## P1: Partial diagnostics without background dependency

### Goal

Make the diagnostics/options page useful even if the background page is not responding.

### Ideas

- Render manifest info directly from the options page using `browser.runtime.getManifest()`.
- Include page-level user agent and extension URL.
- Independently test whether `browser.runtime.sendMessage({type: "ping"})` works.
- If background is unavailable, show specific recovery instructions.
- Keep `Reset extension data` visible even if background calls fail.

### Constraint

A full reset still needs background support to clear tab session markers and recreate context menus. The page can still attempt `browser.storage.local.clear()` directly if background is unavailable.

## P2: Use `storage.session` as session backup

### Goal

Provide an in-browser-session backup if `storage.local` is unavailable or temporarily failing.

### Candidate usage

- Store current pairs.
- Store mode/routing/paused state.
- Store memory diagnostics snapshot.

### Constraints

- Do not use as durable persistence.
- Do not rely on it after browser restart.
- Check Firefox support and behavior across target versions before release.

## P2: Better health telemetry inside diagnostics

### Add fields

```json
{
  "background": {"ok": true},
  "storageLocal": {
    "read": {"ok": true},
    "write": {"ok": true},
    "remove": {"ok": true}
  },
  "storageSession": {"available": true, "ok": true},
  "contextMenus": {"lastCreateOk": true},
  "sessionMarkers": {"checkedTabs": 0, "errors": []},
  "degradedMode": false
}
```

### Notes

- Keep diagnostics local only.
- Do not transmit diagnostics anywhere.
- Keep URL logging origin-only.

## P2: Reset flow improvements

### Ideas

- Add two reset levels:
  - `Repair diagnostics log only`
  - `Reset all extension data`
- Add a dry-run preview:
  - number of pairs
  - number of session markers found
  - logging status
- Add copyable reset result JSON.

### Constraint

Keep reset manual and confirmation-gated.

## P2: Development-only storage failure simulation

### Goal

Make storage failure testable without corrupting Firefox profile state.

### Options

- Add a test-only flag in development builds.
- Mock `browser.storage.local.get/set/remove` in unit tests.
- Add Playwright smoke test around popup failure rendering.

### Do not ship

Do not expose a user-facing “simulate failure” control in the public add-on.

## P2: Improve startup sequencing

### Goal

Reduce chance that context menus or badge updates fail during background startup.

### Ideas

- Wrap top-level startup calls:

```js
createContextMenus().catch(e => console.error("createContextMenus failed", e));
updateBadge().catch(e => console.error("updateBadge failed", e));
```

- Track last menu creation error in memory health.
- Keep context menu creation independent from storage-heavy state where possible.

## P2: More explicit popup degraded-state UI

### Goal

If runtime fallback is implemented, show a compact warning without cluttering the normal popup.

### Suggested behavior

Normal state:

```text
Routing: On
[pairs list]
```

Degraded state:

```text
Storage unavailable — changes may not persist.
[pairs list from memory]
```

### Constraint

Do not show a “healthy” status line in normal operation.

## P3: Re-evaluate persistent background page

### Current state

The extension currently uses a Manifest V2 non-persistent background page:

```json
"background": {
  "scripts": ["lib/util.js", "background.js"],
  "persistent": false
}
```

### Potential change

Switch to:

```json
"persistent": true
```

### Pros

- Keeps in-memory fallback state alive while Firefox remains open.
- Reduces event-page wake/sleep edge cases.
- Simplifies runtime diagnostics.

### Cons

- Broader behavior change.
- Needs careful Firefox MV2 compatibility testing.
- Does not solve storage failures after browser restart.
- May increase memory usage.

### Recommendation

Defer unless storage/background lifecycle issues recur.

## P3: Manifest V3 feasibility review

### Goal

Understand future Firefox extension-platform direction.

### Tasks

- Review Firefox MV3 support for required APIs.
- Check context menu, tabs, storage, sessions, and content-script behavior.
- Evaluate service worker lifetime implications for routing.
- Do not migrate until platform behavior is suitable.

## P3: Structured state module

### Goal

Reduce direct storage access scattered through `background.js`.

### Candidate module

```text
state.js
- loadState()
- getPairs()
- setPairs()
- getMode()
- setMode()
- getRouting()
- setRouting()
- getPausedPairs()
- setPausedPairs()
- getHealth()
```

### Benefits

- Easier testing.
- Centralized validation.
- Easier fallback implementation.
- Clear separation between runtime state and persistence.

### Risk

Moderate refactor. Defer until there is a stronger reason.

## P3: More robust session marker reconciliation

### Ideas

- Add marker validation.
- Detect duplicate left/right markers for same pair ID.
- Track orphan marker count in diagnostics.
- Provide a diagnostics action to clear orphan markers only.

### Constraint

Do not change existing marker shape without backward compatibility.

## P3: User-facing recovery documentation

### Add README troubleshooting entry

Possible entry:

```md
### Popup says "Extension state unavailable"

Open Add-ons → Split View Router → Preferences → Diagnostics.

Use "Copy diagnostics" when reporting an issue.

If the diagnostics page reports local storage failures, use "Reset extension data".
This clears saved pairs/settings but does not close tabs.
```

### Add AMO support response snippet

Prepare a short support response for rare reports:

```text
Open Split View Router preferences, go to Diagnostics, click Copy diagnostics, then try Reset extension data. If storage reset fails, remove and reinstall the add-on.
```

## P3: Better automated release checklist

### Add checklist

- Run `npm test`.
- Run `npm run lint`.
- Run `npm run build`.
- Install over previous AMO build in a clean profile.
- Install over previous AMO build in a profile with existing pairs.
- Verify popup.
- Verify context menus.
- Verify diagnostics.
- Verify reset.
- Verify session restore.
- Package and submit to AMO.

## Deferred decisions

### Automatic full reset

Decision: do not implement unless there is clear evidence that automatic reset is safe and necessary.

Reason: full reset is destructive and removes user state.

### Backup persistence beyond Firefox APIs

Decision: do not implement.

Reason: extension should stay local and simple. Avoid IndexedDB/custom persistence unless there is a strong need.

### Changing pair semantics

Decision: do not change.

Reason: current workflow is public and stable.

## Revisit triggers

Revisit this TODO list if any of the following occurs:

- A user reports the popup stuck on state-unavailable/reloading.
- A user reports diagnostics page failing.
- AMO reviews mention reinstall required.
- Firefox changes storage/session behavior.
- Internal testing reproduces `browser.storage.local` backend failures.
