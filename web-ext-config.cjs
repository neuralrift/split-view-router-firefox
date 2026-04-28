// web-ext configuration. See https://github.com/mozilla/web-ext

module.exports = {
  // Files excluded from the build .zip. The packaged extension contains only
  // the files Firefox needs at runtime — no dev tooling, screenshots, or docs
  // that already live in the GitHub repo or AMO listing.
  ignoreFiles: [
    "package.json",
    "package-lock.json",
    "node_modules",
    "web-ext-config.cjs",
    "web-ext-artifacts",
    "TESTING.md",
    "CHANGELOG.md",
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
    startUrl: ["about:debugging#/runtime/this-firefox"],
  },
};
