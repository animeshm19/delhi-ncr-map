import { defineConfig, devices } from "@playwright/test";

// Local runs use the preinstalled Chromium if Playwright's own isn't available.
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;
// Sandboxed environments reach the internet (map tiles) only through a proxy.
const proxy = process.env.PW_PROXY ? { server: process.env.PW_PROXY, bypass: "localhost,127.0.0.1" } : undefined;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: "http://localhost:3100",
    trace: "retain-on-failure",
    launchOptions: executablePath ? { executablePath } : {},
    proxy,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "node scripts/e2e/stack.mjs",
    url: "http://localhost:3100/about",
    timeout: 300_000,
    reuseExistingServer: !process.env.CI,
    stdout: "pipe",
    stderr: "pipe",
  },
});
