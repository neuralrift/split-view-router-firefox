# Testing

## Automated

```bash
npm install
npx playwright install chromium
npm test           # unit tests
npm run test:e2e   # Chromium + unpacked extension
```

The e2e suite (`tests/e2e/routing.spec.js`) serves fixture pages from
`tests/e2e/fixtures/`: a plain page, a ServiceNow-style list in a `gsft_main` iframe,
and a case page whose link sits in a shadow root. It simulates split membership by
overlaying `splitViewId` in the service worker (see `tests/e2e/harness.js`).

## Manual check in Chrome

1. Load the extension unpacked (README → Install).
2. Put a ServiceNow list on the left and any page on the right in one split view.
3. Click a record number: it opens on the right, the list stays.
4. Repeat on a workspace case page and on STC.
5. Ctrl-click and middle-click a link: it opens a new tab as usual.
6. Click a link in the right tab: it navigates the right tab.
7. Pause the split from the popup: clicks navigate the left tab again.
8. Separate the split (tab context menu): clicks navigate the left tab.
