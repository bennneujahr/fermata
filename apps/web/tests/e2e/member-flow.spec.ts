// Hauptablauf (PLAN 2.3 Nr. 3): Einladung → Anmeldung mit Code aus der Mail → Einwilligungen einzeln →
// Angaben → Identität → Ausweis (Fake-Didit) → Startseite „eingerichtet“. Auf jeder Seite axe und CSP.
import { expect, test } from "@playwright/test";
import { codeFromMail, createAdmin, createInvitedMember, sql, uniqueEmail, waitForMail } from "./helpers/backend";
import { expectAccessible, watchConsole } from "./helpers/checks";

test.describe.configure({ mode: "serial" });

test("Mitglied: Anmeldung mit Code, Onboarding, Ausweisprüfung, Stand", async ({ page }) => {
  const console = watchConsole(page);
  const adminId = await createAdmin(uniqueEmail("admin"));
  const email = uniqueEmail("anna");
  const userId = await createInvitedMember(email, adminId);

  // Geschützte Seite → Anmeldung
  await page.goto("/start");
  await expect(page).toHaveURL(/\/anmelden\?weiter=%2Fstart/);
  await expectAccessible(page, "/anmelden");

  // Code anfordern
  const before = Date.now() - 1000;
  await page.getByLabel("E-Mail-Adresse").fill(email);
  await page.getByRole("button", { name: "Code anfordern" }).click();
  await expect(page).toHaveURL(/\/anmelden\/code/);
  await expect(page.getByRole("heading", { level: 1, name: "Code eingeben" })).toBeVisible();
  await expectAccessible(page, "/anmelden/code");

  // Falscher Code → Fehlermeldung
  await page.getByLabel("Sechsstelliger Code").fill("000000");
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page.getByText("Der Code stimmt nicht oder ist abgelaufen.")).toBeVisible();

  // Richtiger Code aus der Mail (Mailpit)
  const mail = await waitForMail(email, "Anmeldecode", before);
  expect(mail.html).toContain("/anmelden/bestaetigen?token_hash=");
  await page.getByLabel("Sechsstelliger Code").fill(codeFromMail(mail));
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page).toHaveURL(/\/start$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Guten Tag");
  await expectAccessible(page, "/start (neu)");
  const [inv] = await sql`select accepted_at from app.account_invitations where user_id = ${userId}::uuid`;
  expect(inv!.accepted_at).not.toBeNull();

  // Einwilligungen einzeln
  await page.getByRole("link", { name: "Weiter mit den Einwilligungen" }).click();
  for (const [title, box] of [
    ["Nutzungsbedingungen", "Ich habe die Nutzungsbedingungen gelesen"],
    ["Datenschutzhinweise", "Ich habe die Datenschutzhinweise zur Kenntnis genommen"],
    ["Einwilligung: Geschlecht und gesuchtes Geschlecht", "Ich willige ausdrücklich ein, dass Fermata mein Geschlecht"],
  ] as const) {
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expectAccessible(page, `Einwilligung ${title}`);
    // Ohne Häkchen geht es nicht weiter
    await page.getByRole("button", { name: "Zustimmen und weiter" }).click();
    await expect(page.getByText("Bitte setzen Sie das Häkchen")).toBeVisible();
    await page.getByLabel(box).check();
    await page.getByRole("button", { name: "Zustimmen und weiter" }).click();
  }
  // Angaben (18+, PLZ → Ort)
  await expect(page).toHaveURL(/\/onboarding\/angaben/);
  const consents = await sql`select kind from app.consents where user_id = ${userId}::uuid order by id`;
  expect(consents.map((c) => c.kind)).toEqual(["agb", "datenschutz_kenntnis", "art9_profile"]);
  await expectAccessible(page, "/onboarding/angaben");
  await page.getByLabel("Vorname").fill("Anna");
  await page.getByLabel("Nachname").fill("Albers");
  await page.getByLabel("Geburtsdatum").fill("2015-01-01");
  await page.getByLabel("Postleitzahl").fill("19053");
  await page.getByLabel("Postleitzahl").blur();
  await expect(page.getByLabel("Ort", { exact: true })).toHaveValue("Schwerin");
  await page.getByRole("button", { name: "Speichern und weiter" }).click();
  await expect(page.getByText("Fermata ist erst ab 18 Jahren möglich.")).toBeVisible();
  await expectAccessible(page, "/onboarding/angaben (Fehler)");
  await page.getByLabel("Geburtsdatum").fill("1990-05-17");
  await page.getByRole("button", { name: "Speichern und weiter" }).click();

  // Identität und Anrede
  await expect(page).toHaveURL(/\/onboarding\/identitaet/);
  await expectAccessible(page, "/onboarding/identitaet");
  await page.getByRole("button", { name: "Speichern und weiter" }).click();
  await expect(page.getByText("Bitte wählen Sie eine Antwort.")).toBeVisible();
  await page.getByRole("radio", { name: "eine Frau" }).check();
  await page.getByRole("checkbox", { name: "Männer" }).check();
  await page.getByRole("button", { name: "Speichern und weiter" }).click();

  // Ausweis: Einwilligung biometrie, dann Fake-Didit
  await expect(page).toHaveURL(/\/onboarding\/ausweis/);
  await expectAccessible(page, "/onboarding/ausweis");
  await page.getByLabel("Ich willige ausdrücklich ein, dass Didit").check();
  await page.getByRole("button", { name: "Zustimmen und weiter" }).click();
  await page.getByRole("button", { name: "Ausweis jetzt prüfen" }).click();
  await expect(page).toHaveURL(/\/onboarding\/ausweis\/simulation\?sitzung=fake_/);
  await expectAccessible(page, "/onboarding/ausweis/simulation");
  await page.getByRole("button", { name: "Ausweis bestätigen" }).click();
  await expect(page).toHaveURL(/\/onboarding\/ausweis\/zurueck/);
  await expect(page.getByRole("heading", { level: 1, name: "Ihr Ausweis ist geprüft" })).toBeVisible({ timeout: 20_000 });
  await expectAccessible(page, "/onboarding/ausweis/zurueck");

  const [v] = await sql`select status, is_adult, birth_year, name_match, birth_date_match, provider_session_deleted_at from app.verifications where user_id = ${userId}::uuid`;
  expect(v).toMatchObject({ status: "approved", is_adult: true, birth_year: 1990, name_match: true, birth_date_match: true });
  expect(v!.provider_session_deleted_at).not.toBeNull();

  // Startseite: eingerichtet
  await page.getByRole("link", { name: "Zur Startseite", exact: true }).click();
  await expect(page.getByText("Ihr Konto ist eingerichtet.")).toBeVisible();
  await expectAccessible(page, "/start (eingerichtet)");
  const [acc] = await sql`select status from app.accounts where user_id = ${userId}::uuid`;
  expect(acc!.status).toBe("active");

  // Platzhalter-Seiten und Hilfe aus der Navigation
  for (const [name, heading] of [
    ["Gespräch", "Gespräch"],
    ["Abende", "Abende"],
    ["Mitgliedschaft", "Mitgliedschaft"],
    ["Konto", "Konto"],
  ] as const) {
    await page.getByRole("navigation", { name: "Hauptnavigation" }).first().getByRole("link", { name }).click();
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    await expectAccessible(page, name);
  }
  await page.getByRole("link", { name: "Hilfe und Sicherheit" }).click();
  await expect(page.getByRole("link", { name: /030 12074182 anrufen/ })).toHaveAttribute("href", "tel:03012074182");
  await expect(page.getByRole("link", { name: "Notruf 110 anrufen" })).toHaveAttribute("href", "tel:110");
  await expectAccessible(page, "/hilfe");
  console.expectClean();
});

test("Anmeldung über den Link aus der Mail (token_hash, ein Klick)", async ({ page }) => {
  const adminId = await createAdmin(uniqueEmail("admin"));
  const email = uniqueEmail("link");
  await createInvitedMember(email, adminId);
  const before = Date.now() - 1000;
  await page.goto("/anmelden");
  await page.getByLabel("E-Mail-Adresse").fill(email);
  await page.getByRole("button", { name: "Code anfordern" }).click();
  await expect(page).toHaveURL(/\/anmelden\/code/);
  const mail = await waitForMail(email, "Anmeldecode", before);
  const href = /href="(https?:\/\/[^"/]+\/anmelden\/bestaetigen\?[^"]+)"/.exec(mail.html)?.[1]?.replace(/&amp;/g, "&");
  expect(href).toBeTruthy();
  await page.context().clearCookies();
  await page.goto(href!);
  await expectAccessible(page, "/anmelden/bestaetigen");
  await page.getByRole("button", { name: "Jetzt anmelden" }).click();
  await expect(page).toHaveURL(/\/start$/);
  // Der Link ist danach verbraucht
  await page.context().clearCookies();
  await page.goto(href!);
  await page.getByRole("button", { name: "Jetzt anmelden" }).click();
  await expect(page.getByText("Dieser Link ist abgelaufen oder wurde schon benutzt.")).toBeVisible();
});

test("Unbekannte Adresse: gleiche Antwort wie bei Eingeladenen (keine Auskunft)", async ({ page }) => {
  await page.goto("/anmelden");
  await page.getByLabel("E-Mail-Adresse").fill(uniqueEmail("unbekannt"));
  await page.getByRole("button", { name: "Code anfordern" }).click();
  await expect(page).toHaveURL(/\/anmelden\/code/);
  await expect(page.getByText(/ist jetzt ein Code unterwegs/)).toBeVisible();
});
