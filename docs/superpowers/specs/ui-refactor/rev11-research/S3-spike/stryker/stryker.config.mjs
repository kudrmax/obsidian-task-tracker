/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  testRunner: "vitest",
  vitest: { configFile: "vitest.config.mts" },
  mutate: ["src/**/*.ts"],
  checkers: [],
  reporters: ["clear-text", "json", "progress"],
  incremental: true,
  incrementalFile: "reports/stryker-incremental.json",
  thresholds: { high: 90, low: 80, break: 70 },
  tempDirName: ".stryker-tmp",
};
