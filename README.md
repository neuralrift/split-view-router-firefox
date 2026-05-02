# Split View Router 🔀

[![Version](https://img.shields.io/badge/version-1.1.0-blue.svg)](https://github.com/neuralrift/split-view-router-firefox/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Firefox Add-on](https://img.shields.io/badge/Firefox-Add--on-orange.svg)](https://addons.mozilla.org/en-US/firefox/addon/split-view-router/)

**Edge-style link routing for Firefox's built-in split tab view.**

Pair two tabs as a split, and clicks in the left tab automatically open in the right tab. Anchor your research on the left while browsing results on the right.

![Split View Router Hero](screenshots/promo1.png)

---

## ✨ Features

- **Pair & Route**: Connect any two tabs as a left/right split via the context menu.
- **Smart Persistence**: Pairings survive browser restarts and session restores (v1.1.0+).
- **Dual Routing Modes**:
  - **Simple Mode** (Default): Left-click routes to right; Ctrl+click opens a new tab.
  - **Ctrl Mode**: Ctrl+click routes to right; plain click navigates the left tab.
- **Secure by Design**: Hardened `window.postMessage` validation to prevent malicious cross-origin routing.
- **Modern Performance**: Optimized startup with parallel session reconciliation and storage mutexes.
- **Native Experience**: Respects `target="_blank"`, `window.open()`, and browser history.

---

## 📸 Screenshots

| Pair in 3 Steps | Configuration | Context Menu |
| :--- | :--- | :--- |
| ![Pairing](screenshots/promo2.png) | ![Popup](screenshots/promo3.png) | ![Menu](screenshots/promo4.png) |

---

## 🚀 Installation

### For Users
* **Firefox Add-ons**: [![Get the Add-on](https://blog.mozilla.org/addons/files/2015/11/get-the-addon-button.png)](https://addons.mozilla.org/en-US/firefox/addon/split-view-router/)
* **Manual**: Download the latest [release ZIP](https://github.com/neuralrift/split-view-router-firefox/releases), extract, and load via `about:debugging`.

### For Developers
1. Clone the repository:
   ```bash
   git clone https://github.com/neuralrift/split-view-router-firefox.git
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Load the extension in Firefox via `about:debugging` by selecting `manifest.json`.

---

## 🛠 Usage

1. **Split**: Right-click a tab and select **Split Tab** (Firefox native feature).
2. **Pair**: Highlight both tabs (Ctrl-click), then right-click → **Pair selected tabs as split**.
3. **Browse**: Click links on the left; watch them open on the right.

> [!TIP]
> Use the toolbar popup to toggle routing globally or switch between **Simple** and **Ctrl** modes.

---

## 🔒 Permissions & Privacy

We value your privacy. This extension **collects no data** and runs entirely locally.

| Permission | Purpose |
| :--- | :--- |
| `tabs` | Navigate the right tab and track tab closures. |
| `storage` | Persist your settings and routing pairs. |
| `sessions` | Allow pairs to survive browser restarts. |
| `contextMenus` | Provide the right-click Pair/Unpair actions. |
| `<all_urls>` | Intercept link clicks on the sites you choose to pair. |

Full privacy details are available in [PRIVACY.md](PRIVACY.md).

---

## 🧪 Development & Testing

Built with a focus on reliability and security.

* **Unit Testing**: Powered by [Vitest](https://vitest.dev/).
* **E2E Testing**: Powered by [Playwright](https://playwright.dev/).

```bash
npm test          # Run unit tests
npm run test:e2e  # Run end-to-end smoke tests
```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
