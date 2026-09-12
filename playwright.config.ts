import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/generated",
  fullyParallel: false,
  // Each test cold-starts a brand new ToolBerry workspace via onboarding; running
  // multiple of these concurrently overloads the remote QA site and causes
  // spurious timeouts. Force serial execution across files too.
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    trace: "retain-on-failure",
    // ToolBerry renders `testid="..."` (no "data-" prefix), not the standard
    // `data-testid`, so getByTestId() needs to look for the right attribute.
    testIdAttribute: "testid",
  },
});
