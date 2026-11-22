import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

const browser = (provider = playwright()) => ({
  enabled: true,
  headless: true,
  provider,
  instances: [{ browser: "chromium" as const }],
});

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.{ts,tsx}"],
          exclude: ["src/**/*.browser.test.{ts,tsx}"],
        },
      },
      { test: { name: "browser", include: ["src/**/*.browser.test.{ts,tsx}"], browser: browser() } },
      {
        test: {
          name: "bench",
          include: ["bench/**/*.bench.test.ts"],
          browser: browser(
            playwright({ launchOptions: { args: ["--js-flags=--expose-gc", "--enable-precise-memory-info"] } }),
          ),
        },
      },
    ],
  },
});
