import { expect, test } from "@playwright/test";
import { expectAccessible, watchConsole } from "./helpers/checks";

test("Anmeldeseite lädt ohne CSP-Verstöße", async ({ page }) => {
  const c = watchConsole(page);
  await page.goto("/anmelden");
  await expect(page.getByRole("heading", { level: 1, name: "Anmelden" })).toBeVisible();
  await page.screenshot({ path: "test-results/smoke-anmelden.png", fullPage: true });
  await expectAccessible(page, "/anmelden");
  c.expectClean();
});
