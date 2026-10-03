// Erzeugt die Bildschirmfotos für Benn: Startseite (Desktop 1440 / Mobil 390, hell / dunkel),
// Willkommensseite mit Daten, Formular mit Fehlern, wichtige Unterseiten.
import { join } from "node:path";
import { test, type Page } from "@playwright/test";
import { confirmLinkFrom, latestMail, resetWaitlist, sql } from "../db";

const OUT = join(import.meta.dirname, "..", "..", "..", "..", "docs", "screenshots", "landing");
const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };

async function settle(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
}

async function shoot(page: Page, name: string, fullPage = true): Promise<void> {
  await settle(page);
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage, animations: "disabled" });
}

for (const [label, scheme] of [
  ["hell", "light"],
  ["dunkel", "dark"],
] as const) {
  test(`Startseite Desktop ${label}`, async ({ browser }) => {
    const page = await browser.newPage({ viewport: DESKTOP, colorScheme: scheme });
    await page.goto("/");
    await shoot(page, `startseite-desktop-1440-${label}`);
    await page.close();
  });
  test(`Startseite Mobil ${label}`, async ({ browser }) => {
    const page = await browser.newPage({ viewport: MOBILE, colorScheme: scheme, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await page.goto("/");
    await shoot(page, `startseite-mobil-390-${label}`);
    await page.close();
  });
}

test("Formular mit Fehlern", async ({ browser }) => {
  for (const [name, viewport, dsf] of [
    ["formular-fehler-desktop-1440", DESKTOP, 1],
    ["formular-fehler-mobil-390", MOBILE, 2],
  ] as const) {
    const page = await browser.newPage({ viewport, deviceScaleFactor: dsf });
    await page.goto("/#warteliste");
    await page.locator("[data-submit]").waitFor({ state: "visible" });
    await page.waitForFunction(() => !(document.querySelector("[data-submit]") as HTMLButtonElement).disabled);
    await page.getByLabel("E-Mail-Adresse").fill("anna@beispiel");
    await page.locator("[data-submit]").click();
    await page.getByRole("alert").waitFor();
    await page.mouse.move(0, 0);
    await settle(page);
    await page.locator(".join").screenshot({ path: join(OUT, `${name}.png`), animations: "disabled" });
    await page.close();
  }
});

test("Willkommen mit Daten und Unterseiten", async ({ browser }) => {
  await resetWaitlist();
  // 37 bestätigte Einträge vor Anna, damit der Platz realistisch aussieht.
  await sql`
    insert into public.waitlist (first_name, email, region, postal_code, consent_text_version, consent_at, confirmed_at, base_number, is_founding_member)
    select 'Person', 'person' || i || '@example.org', 'schwerin', '19053', 'warteliste-2026-10-03-entwurf', now(), now() - (40 - i) * interval '1 hour', i, true
    from generate_series(1, 37) i`;
  await sql`update public.waitlist_counters set last_number = 37 where region_group = 'westmecklenburg'`;

  const page = await browser.newPage({ viewport: DESKTOP });
  await page.goto("/");
  await page.waitForFunction(() => !(document.querySelector("[data-submit]") as HTMLButtonElement).disabled);
  await page.getByLabel("Vorname").fill("Anna");
  await page.getByLabel("E-Mail-Adresse").fill("anna@example.org");
  await page.getByLabel("Region", { exact: true }).selectOption("schwerin");
  await page.getByLabel("Postleitzahl").fill("19055");
  await page.getByRole("checkbox").check();
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: "Auf die Warteliste setzen" }).click();
  await page.waitForURL(/\/bestaetigen$/);
  await shoot(page, "bestaetigen-desktop-1440-hell");

  const mail = await latestMail("anna@example.org", "waitlist.confirm");
  await page.goto(confirmLinkFrom(mail.text));
  await page.locator('[data-part="ready"]').waitFor();
  const welcomeUrl = page.url();
  await shoot(page, "willkommen-desktop-1440-hell");

  for (const [label, scheme] of [
    ["hell", "light"],
    ["dunkel", "dark"],
  ] as const) {
    const mobile = await browser.newPage({ viewport: MOBILE, colorScheme: scheme, deviceScaleFactor: 2, isMobile: true });
    await mobile.goto(welcomeUrl);
    await mobile.locator('[data-part="ready"]').waitFor();
    await shoot(mobile, `willkommen-mobil-390-${label}`);
    await mobile.close();
  }
  const dark = await browser.newPage({ viewport: DESKTOP, colorScheme: "dark" });
  await dark.goto(welcomeUrl);
  await dark.locator('[data-part="ready"]').waitFor();
  await shoot(dark, "willkommen-desktop-1440-dunkel");
  await dark.close();

  for (const path of ["gruendungsmitglied", "datenschutz", "bestaetigung-abgelaufen", "abmelden"]) {
    await page.goto(`/${path}`);
    await shoot(page, `${path}-desktop-1440-hell`);
  }
  await page.goto("/gibt-es-nicht");
  await shoot(page, "404-desktop-1440-hell");
  await page.close();
});
