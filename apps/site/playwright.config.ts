import { defineConfig, devices } from "@playwright/test";

// The tour (e2e/tour.spec.ts) runs against the built site: `pnpm site:build` first.
const size = { width: 1280, height: 800 };
const port = 4400; // 4321 is the usual dev preview

export default defineConfig({
  testDir: "e2e",
  timeout: 120_000,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: `http://localhost:${port}/`,
    viewport: size,
    video: { mode: "on", size },
  },
  projects: [{ name: "chromium" }],
  webServer: {
    // --ignore-lock: astro preview refuses to start beside another preview without it.
    command: `astro preview --port ${port} --ignore-lock`,
    url: `http://localhost:${port}/`,
    reuseExistingServer: !process.env.CI,
  },
});
