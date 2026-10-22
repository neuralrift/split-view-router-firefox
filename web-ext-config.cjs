// web-ext configuration. See https://github.com/mozilla/web-ext

module.exports = {
  // Files excluded from the build .zip. The packaged extension contains only
  // the files Chrome needs at runtime, with docs/screenshots kept in the repo.
  ignoreFiles: [
    "package.json",
    "package-lock.json",
    "node_modules",
    "web-ext-config.cjs",
    "web-ext-artifacts",
    "TESTING.md",
    "CHANGELOG.md",
    "split-view-router-v1.1.1-implementation-plan.md",
    "todo.md",
    "screenshots",
    "artwork",
    ".github",
    ".gitignore",
    ".git",
    "tests",
    "playwright.config.js",
    "playwright-report",
    "test-results",
    "vitest.config.js",
  ],

  build: {
    overwriteDest: true,
  },

  run: {
    target: ["chromium"],
    startUrl: ["chrome://extensions/"],
  },
};
