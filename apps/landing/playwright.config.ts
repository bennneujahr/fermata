// Ende-zu-Ende-Tests gegen die gebaute Seite (@astrojs/node), den lokalen Server der Edge Functions und die
// Test-Datenbank aus scripts/db.sh. Vorher: DB_PORT=… DB_CONTAINER=… bash scripts/db.sh reset (Repo-Wurzel).
import { defineConfig, devices } from "@playwright/test";
import { E2E } from "./tests/env";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  globalSetup: "./tests/global-setup.ts",
  globalTeardown: "./tests/global-teardown.ts",
  use: {
    baseURL: E2E.siteUrl,
    locale: "de-DE",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: [
    {
      command: "deno run --allow-net --allow-env --allow-read ../../supabase/functions/dev-server.ts",
      port: E2E.functionsPort,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: E2E.functionsEnv,
      stdout: "ignore",
    },
    {
      command: `FERMATA_ADAPTER=node PUBLIC_FUNCTIONS_URL=${E2E.functionsUrl} PUBLIC_SITE_URL=${E2E.siteUrl} pnpm build && PORT=${E2E.sitePort} HOST=localhost node dist/server/entry.mjs`,
      url: E2E.siteUrl,
      reuseExistingServer: !process.env.CI,
      timeout: 240_000,
      stdout: "ignore",
    },
  ],
});
