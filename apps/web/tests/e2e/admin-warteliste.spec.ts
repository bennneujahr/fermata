// Admin „Warteliste“, „Mitgliedschaft“ und „Einstellungen“: Zahlen, Einladung in die App nach Platz, weiterer Code,
// Erklärungen zur Mitgliedschaft, Kontingent-Korrektur mit Pflicht-Begründung, Einstellungen nach Gruppen mit Platzhaltern.
import { expect, test } from "@playwright/test";
import { adminSession, type AdminSession } from "./helpers/admin";
import { contractActions, waitlistEntries } from "./helpers/admin-fixtures";
import { outboxMail, sql } from "./helpers/backend";
import { expectAccessible, watchConsole } from "./helpers/checks";
import { onboardedMember } from "./helpers/member";

test.describe.configure({ mode: "serial" });

let admin: AdminSession;

test.beforeAll(async ({ browser }) => {
  admin = await adminSession(browser);
});

test("Warteliste: Zahlen, weiterer Code, die ersten zwei nach Platz in die App einladen", async ({ browser }) => {
  // Frühere Testeinträge ausblenden: als eingeladen markieren, damit die neuen vorne stehen.
  await sql`update public.waitlist set invited_to_app_at = coalesce(invited_to_app_at, now()) where region_group = 'westmecklenburg'`;
  const entries = await waitlistEntries(["Ute", "Vera", "Wim"]);
  const ctx = await browser.newContext({ storageState: admin.state });
  const page = await ctx.newPage();
  const console = watchConsole(page);
  await page.goto("/admin/warteliste");
  await expect(page.getByRole("heading", { level: 1, name: "Warteliste" })).toBeVisible();
  await expect(page.getByRole("img", { name: /Säulendiagramm: neue Einträge/ })).toBeVisible();
  await expect(page.getByRole("table", { name: "Nach Region" }).or(page.getByRole("region", { name: "Nach Region" })).first()).toBeVisible();
  await expectAccessible(page, "/admin/warteliste");

  const table = page.getByRole("table", { name: "In die App einladen" });
  const names = await table.locator("tbody tr th").allTextContents();
  expect(names.slice(0, 3).map((n) => n.trim())).toEqual(["Ute", "Vera", "Wim"]);

  // Weiterer Einladungscode für Wim
  await table.getByRole("button", { name: "Weiteren Einladungscode für Wim" }).click();
  await expect(table.getByText(/Neuer Code: [A-Z0-9]{8}/)).toBeVisible();
  expect((await sql`select count(*)::int as n from public.waitlist_invites where inviter_id = ${entries[2]!.id}::uuid`)[0]!.n).toBe(1);

  // Die ersten zwei auswählen und einladen
  await page.getByLabel("Wie viele").fill("2");
  await page.getByRole("button", { name: "Einträge zeigen" }).click();
  await expect(page).toHaveURL(/anzahl=2/);
  await page.getByRole("button", { name: "Erste 2 auswählen" }).click();
  await expect(page.getByLabel(/^Platz \d+, Ute auswählen$/)).toBeChecked();
  await expect(page.getByLabel(/^Platz \d+, Wim auswählen$/)).not.toBeChecked();
  await page.getByRole("button", { name: "2 Personen einladen" }).click();
  const dialog = page.getByRole("dialog", { name: "2 Personen in die App einladen?" });
  await expect(dialog.getByText("Ute")).toBeVisible();
  await expectAccessible(page, "Einladen Dialog");
  await dialog.getByRole("button", { name: "Einladen" }).click();
  await expect(page.getByText("2 eingeladen.")).toBeVisible({ timeout: 30_000 });
  for (const e of entries.slice(0, 2)) {
    const [w] = await sql`select invited_to_app_at from public.waitlist where id = ${e.id}::uuid`;
    expect(w!.invited_to_app_at).not.toBeNull();
    const [inv] = await sql`select waitlist_id from app.account_invitations where email = ${e.email}`;
    expect(inv!.waitlist_id).toBe(e.id);
    expect((await outboxMail(e.email, "account.invite"))?.subject).toBe("Ihre Einladung zu Fermata");
  }
  // Wim ist noch nicht eingeladen
  expect((await sql`select invited_to_app_at from public.waitlist where id = ${entries[2]!.id}::uuid`)[0]!.invited_to_app_at).toBeNull();
  console.expectClean();
  await ctx.close();
});

test("Mitgliedschaft: Erklärungen mit Zeitpunkt und Bestätigung, Kontingent korrigieren", async ({ browser }) => {
  const m = await onboardedMember({ first: "Xenia" });
  await contractActions(m.id);
  const before = Number((await sql`select billing.available_evenings(${m.id}::uuid) as n`)[0]!.n);
  const ctx = await browser.newContext({ storageState: admin.state });
  const page = await ctx.newPage();
  const console = watchConsole(page);
  await page.goto("/admin/mitgliedschaft");
  await expect(page.getByRole("heading", { level: 1, name: "Mitgliedschaft" })).toBeVisible();
  const actions = page.getByRole("table", { name: "Erklärungen" });
  await expect(actions.locator("tr", { hasText: "FM-E2E-0001" }).first()).toBeVisible();
  await expect(actions.getByText("noch nicht verschickt").first()).toBeVisible();
  await expectAccessible(page, "/admin/mitgliedschaft");
  await page.getByRole("link", { name: "Kündigung", exact: true }).click();
  await expect(page).toHaveURL(/art=cancel/);
  await expect(actions.locator("tbody tr").first()).toContainText("Kündigung");

  // Person suchen und auswählen
  await page.getByLabel("E-Mail, Name oder Postleitzahl").fill(m.email);
  await page.getByRole("button", { name: "Suchen" }).click();
  await page.getByRole("link", { name: "Auswählen" }).click();
  await expect(page).toHaveURL(new RegExp(`person=${m.id}`));
  const form = page.getByTestId("ledger-form");
  await form.getByLabel(/^Abende/).fill("2");
  await form.getByLabel("Begründung (Pflicht)").fill("x");
  await form.getByRole("button", { name: "Korrektur buchen" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Buchen" }).click();
  await expect(form.getByText(/eine Begründung mit mindestens 3 Zeichen/)).toBeVisible();
  await form.getByLabel(/^Abende/).fill("2");
  await form.getByLabel("Begründung (Pflicht)").fill("Ausgleich für abgesagten Abend durch das Lokal");
  await form.getByRole("button", { name: "Korrektur buchen" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Buchen" }).click();
  await expect(form.getByText("Gebucht.")).toBeVisible();
  expect(Number((await sql`select billing.available_evenings(${m.id}::uuid) as n`)[0]!.n)).toBe(before + 2);
  await expect(page.getByRole("table", { name: "Buchungen" }).getByText("Ausgleich für abgesagten Abend durch das Lokal")).toBeVisible();
  console.expectClean();
  await ctx.close();
});

test("Einstellungen: Gruppen, Platzhalter mit Frage aus PLATZHALTER.md, ändern", async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: admin.state });
  const page = await ctx.newPage();
  await page.goto("/admin/einstellungen");
  await expect(page.getByRole("heading", { level: 1, name: "Einstellungen" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Springen zu" }).getByRole("link", { name: /Auswahl/ })).toBeVisible();
  await expect(page.getByText(/Einstellungen sind noch Platzhalter/)).toBeVisible();
  await page.getByRole("link", { name: "Nur Platzhalter zeigen" }).click();
  await expect(page).toHaveURL(/platzhalter=1/);
  const row = page.locator(".setting", { hasText: "billing.loge_in_test_phase" });
  await expect(row.getByText("Platzhalter", { exact: true })).toBeVisible();
  await expect(row.getByRole("link", { name: "docs/PLATZHALTER.md, Frage B11" })).toBeVisible();
  await expect(page.locator(".setting", { hasText: "matching.weights" }).getByRole("link", { name: /Frage C5/ })).toBeVisible();
  await expect(page.locator(".setting", { hasText: "verification.max_attempts" })).toHaveCount(0);
  await expectAccessible(page, "/admin/einstellungen?platzhalter=1");
  const field = page.getByLabel("Wert (JSON): matching.wait_bonus_max");
  const before = await field.inputValue();
  await field.fill("0.08");
  await page.locator(".setting", { has: field }).getByRole("button", { name: "Speichern" }).click();
  await expect(page.locator(".setting", { has: field }).getByText("Gespeichert.")).toBeVisible();
  expect(Number((await sql`select value from ops.app_settings where key = 'matching.wait_bonus_max'`)[0]!.value)).toBe(0.08);
  await sql`update ops.app_settings set value = ${sql.json(JSON.parse(before))} where key = 'matching.wait_bonus_max'`;
  await ctx.close();
});
