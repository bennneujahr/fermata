// E2E-Tests und Bildschirmfotos gegen den lokalen Stapel (scripts/stack.sh up) und den Produktions-Build (next start).
import { defineConfig, devices } from "@playwright/test";
import { loadStackEnv } from "./tests/e2e/helpers/env";

const env = loadStackEnv();
const chromium = process.env.PW_CHROMIUM_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const launchOptions = { executablePath: chromium };

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3041",
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
    command: "pnpm exec next start --port 3041",
    url: "http://localhost:3041/anmelden",
    reuseExistingServer: true,
    timeout: 60_000,
    env,
  },
});
