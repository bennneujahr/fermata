// E2E-Tests und Bildschirmfotos gegen den lokalen Stapel (scripts/stack.sh up) und den Produktions-Build (next start).
import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";
import { loadStackEnv } from "./tests/e2e/helpers/env";

const env = loadStackEnv();
const appPort = env.APP_PORT ?? "3041";
const appUrl = `http://localhost:${appPort}`;
// Lokal (Cloud-Umgebung) liegt Chromium vorinstalliert unter /opt/pw-browsers; in CI nutzt Playwright sein eigenes.
const preinstalled = process.env.PW_CHROMIUM_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const chromium = existsSync(preinstalled) ? preinstalled : undefined;
const launchOptions = { executablePath: chromium, args: ["--lang=de-DE"], env: { ...process.env, LANG: "de_DE.UTF-8", LANGUAGE: "de" } };

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: appUrl,
    locale: "de-DE",
    timezoneId: "Europe/Berlin",
    trace: "retain-on-failure",
    launchOptions,
  },
  projects: [
    { name: "e2e", testIgnore: /screenshots\.spec\.ts/, use: { ...devices["Desktop Chrome"], launchOptions } },
    { name: "screenshots", testMatch: /screenshots\.spec\.ts/, use: { ...devices["Desktop Chrome"], launchOptions } },
  ],
  webServer: {
    command: `pnpm exec next start --port ${appPort}`,
    url: `${appUrl}/anmelden`,
    reuseExistingServer: true,
    timeout: 60_000,
    env,
  },
});
