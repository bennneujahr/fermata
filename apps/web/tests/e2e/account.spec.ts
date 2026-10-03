// Konto: Datenexport (Art. 15/20), Einwilligung widerrufen, Anrede, Löschung in zwei Schritten (Art. 17).
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { outboxMail, sql } from "./helpers/backend";
import { expectAccessible, watchConsole } from "./helpers/checks";
import { loginByLink, onboardedMember } from "./helpers/member";

test("Datenexport als JSON-Datei mit eigenen Daten", async ({ page }) => {
  const other = await onboardedMember({ first: "Otto" });
  const me = await onboardedMember({ first: "Mira" });
  await loginByLink(page, me.email);
  await page.goto("/konto");
  await expectAccessible(page, "/konto");
  await page.getByRole("link", { name: "Daten herunterladen" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Ihre Daten herunterladen" })).toBeVisible();
  await expectAccessible(page, "/konto/daten");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Datei herunterladen" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^fermata-datenexport-\d{4}-\d{2}-\d{2}\.json$/);
  const data = JSON.parse(readFileSync((await download.path())!, "utf8"));
  expect(data.export.format).toBe("fermata-datenexport");
  expect(data.angaben.first_name).toBe("Mira");
  expect(data.besondere_angaben.religion_und_gesundheit.religion).toBe("evangelisch");
  expect(data.ausweispruefungen[0].status).toBe("approved");
  expect(JSON.stringify(data)).not.toContain(other.id);
  expect(JSON.stringify(data)).not.toContain("Otto");
});

test("Einwilligung widerrufen löscht die Angaben; Anrede wechseln", async ({ page }) => {
  const c = watchConsole(page);
  const me = await onboardedMember({ first: "Rita" });
  await loginByLink(page, me.email);
  await page.goto("/konto/einwilligungen");
  await expectAccessible(page, "/konto/einwilligungen");
  const religion = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: "Religion", exact: true }) });
  await religion.getByRole("button", { name: "Widerrufen" }).click();
  const dialog = page.getByRole("dialog", { name: "Einwilligung widerrufen?" });
  await expect(dialog).toBeVisible();
  await expectAccessible(page, "Widerrufs-Dialog");
  await dialog.getByRole("button", { name: "Ja, widerrufen" }).click();
  await expect(religion.getByText("Nicht erteilt")).toBeVisible();
  const [row] = await sql`select count(*)::int as n from sensitive.profile_sensitive where user_id = ${me.id}::uuid`;
  expect(row!.n).toBe(0);
  // AGB lassen sich nicht widerrufen (nur Konto löschen)
  const agb = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: "Nutzungsbedingungen" }) });
  await expect(agb.getByRole("button", { name: "Widerrufen" })).toHaveCount(0);

  // Anrede Du: Texte wechseln
  await page.goto("/konto");
  await page.getByRole("radio", { name: "Mit „Du“" }).check();
  await page.getByRole("button", { name: "Speichern" }).first().click();
  await expect(page.getByRole("status").filter({ hasText: "Gespeichert." })).toBeVisible();
  await page.goto("/start");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Hallo Rita");
  await expect(page.getByText("Dein Konto ist eingerichtet.")).toBeVisible();
  c.expectClean();
});

test("Konto löschen in zwei Schritten, Bestätigung per Mail, Daten weg", async ({ page }) => {
  const me = await onboardedMember({ first: "Lena" });
  await sql`insert into billing.contract_actions (user_id, kind, details) values (${me.id}::uuid, 'order', '{"e2e": true}')`;
  await loginByLink(page, me.email);
  await page.goto("/konto");
  await page.getByRole("link", { name: "Konto löschen" }).click();
  await expect(page.getByText("Schritt 1 von 2")).toBeVisible();
  await expectAccessible(page, "/konto/loeschen");
  await page.getByRole("link", { name: "Weiter zur Löschung" }).click();
  await expect(page.getByText("Schritt 2 von 2")).toBeVisible();
  await expectAccessible(page, "/konto/loeschen/bestaetigen");
  await page.getByRole("button", { name: "Konto endgültig löschen" }).click();
  await expect(page.getByText("Bitte bestätigen Sie die Löschung mit dem Häkchen.")).toBeVisible();
  await page.getByLabel("Ich möchte mein Konto und meine Daten endgültig löschen.").check();
  await page.getByRole("button", { name: "Konto endgültig löschen" }).click();
  await expect(page).toHaveURL(/\/abgemeldet\?grund=geloescht/);
  await expect(page.getByRole("heading", { level: 1, name: "Ihr Konto ist gelöscht" })).toBeVisible();
  await expectAccessible(page, "/abgemeldet?grund=geloescht");

  const [u] = await sql`select count(*)::int as n from auth.users where id = ${me.id}::uuid`;
  expect(u!.n).toBe(0);
  const [f] = await sql`select count(*)::int as n from private.account_facts where user_id = ${me.id}::uuid`;
  expect(f!.n).toBe(0);
  const [ca] = await sql`select count(*)::int as n from billing.contract_actions where user_id is null and details->>'e2e' = 'true'`;
  expect(ca!.n).toBeGreaterThan(0);
  const mail = await outboxMail(me.email, "account.deleted");
  expect(mail?.subject).toBe("Ihr Konto ist gelöscht");
  // Abgemeldet: geschützte Seiten führen zur Anmeldung
  await page.goto("/konto");
  await expect(page).toHaveURL(/\/anmelden/);
});
