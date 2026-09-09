import { defineConfig } from "vitest/config";

// Separate from vite.config.ts: that one has `root: "src/dev"` for the browser
// harness, which would hide the source tree from the test runner.
//
// No coverage provider configured: both @vitest/coverage-v8 and
// @vitest/coverage-istanbul are broken under vitest 5.0.0 here -- v8 reports 0%
// for files the tests demonstrably exercise, and istanbul throws
// "Coverage must be initialized with a path or an object" out of
// getCoverageMapForUncoveredFiles. Reproduced from a path with no spaces, so it
// is not a path-escaping issue. Revisit on a later vitest.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
