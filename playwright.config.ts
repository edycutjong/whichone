import { defineConfig, devices } from "@playwright/test";

/**
 * E2E runs against the production build of apps/web WITHOUT a Nansen key: the pages, the /judge surface, input
 * validation and the honest "no key" error path are all reachable at 0 credits. Nothing here ever calls Nansen.
 */
// 3000 in CI; 3100 locally so a sibling project's dev server on 3000 is never mistaken for this one
const PORT = process.env.E2E_PORT ?? (process.env.CI ? "3000" : "3100");
const BASE = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "html" : "list",
  use: {
    baseURL: BASE,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chrome", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    // CI builds in its own step (Stage 4); locally, build then start so a stale .next never lies
    command: process.env.CI ? "npm run start" : "npm run build && npm run start",
    url: `${BASE}/judge`,
    // always our own server: reusing whatever answers on the port would test someone else's app
    reuseExistingServer: false,
    timeout: 180_000,
    // the key is stripped on purpose: every E2E assertion must hold with no credential in the server
    env: { ...process.env, PORT, NANSEN_API_KEY: "", NANSEN_OFFLINE: "" },
  },
});
