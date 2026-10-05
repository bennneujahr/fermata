// Religion nur mit eigener Einwilligung (Art. 9) und Offline-Seite über den Service Worker.
import { expect, test } from "@playwright/test";
import { sql } from "./helpers/backend";
import { expectAccessible } from "./helpers/checks";
import { loginByLink, onboardedMember } from "./helpers/member";

test("Religion: ohne Häkchen keine Speicherung, mit Häkchen eigene Einwilligung", async ({ page }) => {
  const me = await onboardedMember({ first: "Ruth", identity: false });
  await loginByLink(page, me.email, /\/start$/);
  await page.goto("/onboarding/identitaet");
  await page.getByRole("radio", { name: "eine Frau" }).check();
  await page.getByRole("checkbox", { name: "Männer" }).check();
  await page.getByText("Religion angeben (freiwillig)").click();
  await expectAccessible(page, "/onboarding/identitaet (Religion offen)");
  await page.getByLabel("Religion oder Weltanschauung").fill("jüdisch");
  await page.getByRole("button", { name: "Speichern und weiter" }).click();
  await expect(page.getByText("Für die Angaben zur Religion braucht es Ihre Einwilligung.")).toBeVisible();
  const [none] = await sql`select count(*)::int as n from app.consents where user_id = ${me.id}::uuid and kind = 'art9_religion'`;
  expect(none!.n).toBe(0);
  await page.getByLabel("Ich willige ausdrücklich ein, dass Fermata meine Angaben zur Religion").check();
  await page.getByRole("button", { name: "Speichern und weiter" }).click();
  await expect(page).toHaveURL(/\/onboarding\/ausweis/);
  const [granted] = await sql`select count(*)::int as n from app.consents where user_id = ${me.id}::uuid and kind = 'art9_religion' and action = 'granted'`;
  expect(granted!.n).toBe(1);
  const [stored] = await sql`select count(*)::int as n from sensitive.profile_sensitive where user_id = ${me.id}::uuid and religion_enc is not null`;
  expect(stored!.n).toBe(1);
});

test("Offline: Service Worker zeigt die Offline-Seite", async ({ page, context }) => {
  await page.goto("/hilfe");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await context.setOffline(true);
  await page.goto("/start").catch(() => {});
  await expect(page.getByRole("heading", { level: 1, name: "Keine Verbindung" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Im Notfall: 110" })).toHaveAttribute("href", "tel:110");
  await context.setOffline(false);
});
