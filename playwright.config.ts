import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/generated",
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    trace: "retain-on-failure",
  },
});
