// Admin: Anmeldung mit Code, Zwei-Faktor einrichten (TOTP), aal2-Bereich, Einladen, Einstellungen, erneuter TOTP-Abfrage.
import { expect, test, type Page } from "@playwright/test";
import { codeFromMail, createAdmin, createInvitedMember, outboxMail, sql, uniqueEmail, waitForMail } from "./helpers/backend";
import { expectAccessible, watchConsole } from "./helpers/checks";
import { totp } from "./helpers/totp";

test.describe.configure({ mode: "serial" });

async function loginWithCode(page: Page, email: string, next = "/admin") {
  const before = Date.now() - 1000;
  await page.goto(next);
  await expect(page).toHaveURL(/\/anmelden/);
  await page.getByLabel("E-Mail-Adresse").fill(email);
  await page.getByRole("button", { name: "Code anfordern" }).click();
  await expect(page).toHaveURL(/\/anmelden\/code/);
  const mail = await waitForMail(email, "Anmeldecode", before);
  await page.getByLabel("Sechsstelliger Code").fill(codeFromMail(mail));
  await page.getByRole("button", { name: "Anmelden" }).click();
}

/** Nächster Code im neuen 30-Sekunden-Fenster (GoTrue lehnt einen schon benutzten Code ab). */
async function freshTotp(secret: string, last?: string): Promise<string> {
  let code = totp(secret);
  while (code === last) {
    await new Promise((r) => setTimeout(r, 1000));
    code = totp(secret);
  }
  return code;
}

test("Admin: TOTP einrichten, Übersicht, Einladen, Einstellungen, erneute Zwei-Faktor-Abfrage", async ({ page }) => {
  const console = watchConsole(page);
  const adminEmail = uniqueEmail("benn");
  const adminId = await createAdmin(adminEmail);

  await loginWithCode(page, adminEmail);
  // Ohne zweiten Faktor: Weiterleitung zur Einrichtung
  await expect(page).toHaveURL(/\/admin\/mfa\/(bestaetigen|einrichten)/);
  await expect(page).toHaveURL(/\/admin\/mfa\/einrichten/, { timeout: 15_000 });
  await expect(page.getByRole("img", { name: "QR-Code für die Authenticator-App" })).toBeVisible();
  await expectAccessible(page, "/admin/mfa/einrichten");
  const secret = (await page.getByTestId("totp-secret").textContent())!.trim();
  await page.getByLabel("Code aus der App").fill("123456");
  await page.getByRole("button", { name: "Bestätigen" }).click();
  await expect(page.getByText("Der Code stimmt nicht.")).toBeVisible();
  const first = await freshTotp(secret);
  await page.getByLabel("Code aus der App").fill(first);
  await page.getByRole("button", { name: "Bestätigen" }).click();

  // Übersicht (aal2)
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { level: 1, name: "Übersicht" })).toBeVisible();
  await expectAccessible(page, "/admin");

  // Einladen
  await page.getByRole("navigation", { name: "Admin-Navigation" }).getByRole("link", { name: "Einladen" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Einladen" })).toBeVisible();
  await expectAccessible(page, "/admin/einladen");
  await page.getByLabel("E-Mail-Adresse").fill("kein-mail");
  await page.getByRole("button", { name: "Einladung senden" }).click();
  await expect(page.getByText("Bitte eine gültige E-Mail-Adresse eingeben.")).toBeVisible();
  const invitee = uniqueEmail("eingeladen");
  await page.getByLabel("E-Mail-Adresse").fill(invitee);
  await page.getByRole("button", { name: "Einladung senden" }).click();
  await expect(page.getByText(`Einladung an ${invitee} ist unterwegs.`)).toBeVisible();
  const mail = await outboxMail(invitee, "account.invite");
  expect(mail?.subject).toBe("Ihre Einladung zu Fermata");
  expect(mail?.text).toContain("http://localhost:3041/anmelden");
  const [acc] = await sql`select a.status, m.status as membership, billing.available_evenings(a.user_id) as n
    from app.accounts a join billing.memberships m using (user_id) join auth.users u on u.id = a.user_id where u.email = ${invitee}`;
  expect(acc).toMatchObject({ status: "onboarding", membership: "free", n: 1 });
  await expect(page.getByRole("cell", { name: "offen" }).first()).toBeVisible();

  // Konten: Suche und Detail ohne Art.-9-Angaben
  const memberEmail = uniqueEmail("dora");
  await createInvitedMember(memberEmail, adminId);
  await page.getByRole("navigation", { name: "Admin-Navigation" }).getByRole("link", { name: "Konten" }).click();
  await page.getByLabel("Suchbegriff").fill(memberEmail);
  await page.getByRole("button", { name: "Suchen" }).click();
  await expect(page.getByRole("link", { name: memberEmail })).toBeVisible();
  await expectAccessible(page, "/admin/konten");
  await page.getByRole("link", { name: memberEmail }).click();
  await expect(page.getByText("Besonders geschützte Angaben (Geschlecht, Religion) sind hier bewusst nicht sichtbar.")).toBeVisible();
  await expectAccessible(page, "/admin/konten/[id]");

  // Prüfungen und Hinweise
  await page.getByRole("navigation", { name: "Admin-Navigation" }).getByRole("link", { name: "Ausweisprüfungen" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Ausweisprüfungen" })).toBeVisible();
  await expectAccessible(page, "/admin/pruefungen");
  await page.getByRole("navigation", { name: "Admin-Navigation" }).getByRole("link", { name: "Sicherheits-Hinweise" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Sicherheits-Hinweise" })).toBeVisible();
  await expectAccessible(page, "/admin/hinweise");

  // Einstellungen: ungültiges JSON, falscher Typ, gültige Änderung mit Verlauf
  await page.getByRole("navigation", { name: "Admin-Navigation" }).getByRole("link", { name: "Einstellungen" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Einstellungen" })).toBeVisible();
  await expectAccessible(page, "/admin/einstellungen");
  const field = page.getByLabel("Wert (JSON): verification.max_attempts");
  const row = page.locator(".setting").filter({ has: field });
  await field.fill("{kaputt");
  await row.getByRole("button", { name: "Speichern" }).click();
  await expect(row.getByText("Das ist kein gültiges JSON.")).toBeVisible();
  await field.fill('"drei"');
  await row.getByRole("button", { name: "Speichern" }).click();
  await expect(row.getByText("Der Typ muss gleich bleiben")).toBeVisible();
  await field.fill("4");
  await row.getByRole("button", { name: "Speichern" }).click();
  await expect(row.getByText("Gespeichert.")).toBeVisible();
  const [setting] = await sql`select value, updated_by from ops.app_settings where key = 'verification.max_attempts'`;
  expect(setting).toMatchObject({ value: 4, updated_by: adminId });
  await sql`update ops.app_settings set value = '3' where key = 'verification.max_attempts'`;

  // Abmelden, wieder anmelden: jetzt TOTP-Abfrage statt Einrichtung
  await page.getByRole("button", { name: "Abmelden" }).click();
  await expect(page).toHaveURL(/\/abgemeldet/);
  await loginWithCode(page, adminEmail);
  await expect(page).toHaveURL(/\/admin\/mfa\/bestaetigen/);
  await expect(page.getByLabel("Code aus der App")).toBeVisible();
  await expectAccessible(page, "/admin/mfa/bestaetigen");
  await page.getByLabel("Code aus der App").fill(await freshTotp(secret, first));
  await page.getByRole("button", { name: "Bestätigen" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  console.expectClean();
});

test("Mitglieder sehen den Admin-Bereich nicht (404), auch nicht direkt", async ({ page }) => {
  const adminId = await createAdmin(uniqueEmail("admin"));
  const email = uniqueEmail("mitglied");
  await createInvitedMember(email, adminId);
  await loginWithCode(page, email, "/start");
  await expect(page).toHaveURL(/\/start/);
  const res = await page.goto("/admin/einstellungen");
  expect(res?.status()).toBe(404);
});
