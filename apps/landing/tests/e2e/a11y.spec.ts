// Barrierefreiheit: axe (WCAG 2.2 AA) auf jeder Seite, hell und dunkel, mit geöffneten Fragen und Fehlerzustand.
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { resetWaitlist } from "../db";
import { confirmFromMail, expect, signUpViaForm, test, uniqueEmail } from "../fixtures";

const PAGES = [
  "/",
  "/bestaetigen",
  "/willkommen",
  "/abmelden",
  "/abgemeldet",
  "/bestaetigung-abgelaufen",
  "/gruendungsmitglied",
  "/impressum",
  "/datenschutz",
  "/gibt-es-nicht",
];

async function axe(page: Page) {
  await page.evaluate(() => document.querySelectorAll("details").forEach((d) => (d.open = true)));
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"]).analyze();
  return result.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join(", ")})`);
}

for (const scheme of ["light", "dark"] as const) {
  test.describe(`axe, ${scheme === "light" ? "hell" : "dunkel"}`, () => {
    test.use({ colorScheme: scheme });
    for (const path of PAGES) {
      test(`${path} ohne Verstöße`, async ({ page }) => {
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        expect(await axe(page)).toEqual([]);
      });
    }

    test("Formular mit Fehlern ohne Verstöße", async ({ page }) => {
      await page.goto("/#warteliste");
      await expect(page.locator("[data-submit]")).toBeEnabled();
      await page.locator("[data-submit]").click();
      await expect(page.locator("#waitlist-form").getByRole("alert")).toBeVisible();
      expect(await axe(page)).toEqual([]);
    });

    test("Willkommen mit Daten ohne Verstöße", async ({ page }) => {
      await resetWaitlist();
      const email = uniqueEmail(`axe-${scheme}`);
      await page.goto("/");
      await signUpViaForm(page, { firstName: "Anna", email });
      expect(await axe(page)).toEqual([]);
      await confirmFromMail(page, email);
      expect(await axe(page)).toEqual([]);
    });
  });
}
