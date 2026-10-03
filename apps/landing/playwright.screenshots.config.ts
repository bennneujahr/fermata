// Bildschirmfotos für die Abnahme (docs/screenshots/landing). Aufruf: pnpm --filter @fermata/landing screenshots
import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

export default defineConfig({
  ...base,
  testDir: "tests/screenshots",
  timeout: 120_000,
});
