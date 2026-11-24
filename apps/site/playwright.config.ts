import { defineConfig } from "@playwright/test";

// The hero recording (e2e/hero.spec.ts) runs against the built site: `pnpm site:build` first.
const port = 4400; // 4321 is the usual dev preview

export default defineConfig({
  testDir: "e2e",
  timeout: 120_000,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${port}/`,
    // A real 2x display, not an emulated one: the recording of an emulated one is 1x.
    viewport: null,
    launchOptions: { args: ["--force-device-scale-factor=2", "--window-size=1280,800", "--hide-scrollbars"] },
  },
  projects: [{ name: "chromium" }],
  webServer: {
    // --ignore-lock: astro preview refuses to start beside another preview without it.
    command: `astro preview --port ${port} --ignore-lock`,
    url: `http://localhost:${port}/`,
    reuseExistingServer: !process.env.CI,
  },
});
