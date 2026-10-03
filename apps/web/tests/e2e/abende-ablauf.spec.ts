// Ein ganzer Abend aus Sicht beider Personen: Vorschlag → Wunschzeiten → Alternative → Bestätigung →
// Erkennungszeichen → Finde-Fenster → Rückmeldung → Kontakttausch (beidseitiges Ja) → Nachbesprechung.
// Zeitpunkte über die Testuhr (ops.sim_clock), am Ende zurückgesetzt.
import { expect, test, type Browser, type Page } from "@playwright/test";
import { sql } from "./helpers/backend";
import { expectAccessible, watchConsole } from "./helpers/checks";
import { berlinAt, clockTo, eveningRow, giveConsent, proposedEvening, resetClock } from "./helpers/abende";
import { magicLinkPath } from "./helpers/backend";

async function pageFor(browser: Browser, email: string): Promise<Page> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(await magicLinkPath(email));
  await page.getByRole("button", { name: "Jetzt anmelden" }).click();
  await page.waitForURL(/\/start$/);
  return page;
}

test.afterEach(async () => {
  await resetClock();
});

test("Ablauf: Wunschzeiten, Alternative, Bestätigung, Finde-Fenster, Rückmeldung, Kontakt bei beidseitigem Ja", async ({ browser }) => {
  test.setTimeout(180_000);
  const seed = await proposedEvening({ tierA: "andante" });
  const id = seed.eveningId;
  const mira = await pageFor(browser, seed.a.email);
  const jonas = await pageFor(browser, seed.b.email);
  const consoleA = watchConsole(mira);
  const consoleB = watchConsole(jonas);

  // Start zeigt den nächsten Schritt
  await expect(mira.locator("#naechster-schritt")).toContainText("Ein Vorschlag: Abend mit Jonas");
  await expectAccessible(mira, "/start mit Vorschlag");

  // Liste
  await mira.goto("/abende");
  const card = mira.locator(`a[href="/abende/${id}"]`);
  await expect(card).toContainText("Vorschlag: ein Abend mit Jonas");
  await expect(card).toContainText("Sie sind dran: Uhrzeit wählen");
  await expect(card).toContainText(/Antwort bis /);
  await expectAccessible(mira, "/abende");

  // Detail: warum, Lokal, Uhrzeiten wählen
  await card.click();
  await expect(mira.getByRole("heading", { level: 1, name: "Vorschlag: ein Abend mit Jonas" })).toBeVisible();
  await expect(mira.locator("#warum")).toContainText("am Wasser spazieren");
  const venue = mira.locator("#lokal");
  await expect(venue).toContainText("Am Pfaffenteich 5");
  await expect(venue).toContainText("Tram 1 und 2");
  await expect(venue).toContainText("Stufenloser Eingang");
  await expect(mira.locator("#schritt")).toContainText(/Frist: bis /);
  await expectAccessible(mira, "Vorschlag");
  const day3 = await berlinAt(3, "19:00");
  const day4 = await berlinAt(4, "19:30");
  const day5 = await berlinAt(5, "20:00");
  await mira.locator(`input[name="times"][value="${day3}"]`).check();
  await mira.locator(`input[name="times"][value="${day4}"]`).check();
  await expect(mira.getByText("2 von höchstens 3 gewählt")).toBeVisible();
  await mira.getByRole("button", { name: "Uhrzeiten senden" }).click();
  await expect(mira.getByRole("heading", { name: "Jonas ist dran" })).toBeVisible();
  expect((await eveningRow(id)).state).toBe("time_requested");
  await expectAccessible(mira, "Warten");

  // Jonas schlägt eine andere Uhrzeit vor
  await jonas.goto(`/abende/${id}`);
  await expect(jonas.getByRole("heading", { name: "Mira schlägt vor" })).toBeVisible();
  await expect(jonas.getByRole("radio")).toHaveCount(2);
  await jonas.getByRole("button", { name: "Andere Uhrzeit vorschlagen" }).click();
  await expect(jonas.locator(`input[name="times"][value="${day3}"]`)).toHaveCount(0); // schon angebotene fehlen
  await expectAccessible(jonas, "Alternative");
  await jonas.locator(`input[name="times"][value="${day5}"]`).check();
  await jonas.getByRole("button", { name: "Vorschlag senden" }).click();
  await expect(jonas.getByRole("heading", { name: "Mira ist dran" })).toBeVisible();
  expect((await eveningRow(id)).state).toBe("time_countered");

  // Mira bestätigt die Alternative → Tisch reserviert
  await mira.reload();
  await expect(mira.getByRole("heading", { name: "Jonas schlägt vor" })).toBeVisible();
  await expect(mira.getByRole("radio")).toBeChecked();
  await mira.getByRole("button", { name: "Diese Uhrzeit bestätigen" }).click();
  await expect(mira.getByRole("heading", { name: "Der Abend steht" })).toBeVisible();
  const row = await eveningRow(id);
  expect(row.state).toBe("confirmed");
  expect(row.starts_at!.toISOString().replace(".000", "")).toBe(day5);
  const [res] = await sql`select table_code from app.evening_reservations where evening_id = ${id}::uuid and status = 'reserved'`;
  await expect(mira.locator("#schritt")).toContainText(res!.table_code as string);
  await expect(mira.locator("#schritt")).toContainText("„Fermata“, 2 Personen");
  await expect(mira.locator("#sicherheit")).toContainText("Abend teilen");
  await expect(mira.locator("#sicherheit").getByRole("link", { name: /Etwas melden/ })).toHaveAttribute("href", `/sicherheit/melden?abend=${id}`);
  await expect(mira.locator(".cancel-area")).toContainText(/gilt die Absage als rechtzeitig/);
  await expectAccessible(mira, "Bestätigt");

  // Erkennungszeichen
  await mira.getByRole("textbox", { name: "Erkennungszeichen" }).fill("grüner Schal");
  await mira.getByRole("button", { name: "Speichern" }).click();
  await expect(mira.getByText("Gespeichert.")).toBeVisible();
  await jonas.reload();
  await jonas.getByRole("textbox", { name: "Erkennungszeichen" }).fill("blaue Jacke, Buch in der Hand");
  await jonas.getByRole("button", { name: "Speichern" }).click();
  await expect(jonas.getByText("Gespeichert.")).toBeVisible();

  // Finde-Fenster: 10 Minuten vor Beginn
  await clockTo(new Date(new Date(day5).getTime() - 10 * 60_000).toISOString());
  await mira.reload();
  const find = mira.locator("#finden");
  await expect(find).toContainText("Jonas");
  await expect(find).toContainText("blaue Jacke, Buch in der Hand");
  await expect(find).toContainText("Fragen Sie im Lokal nach dem Tisch für „Fermata“.");
  await expect(find).toContainText(res!.table_code as string);
  await expectAccessible(mira, "Finde-Fenster");
  await find.getByRole("link", { name: "Finde-Fenster öffnen" }).click();
  await expect(mira).toHaveURL(new RegExp(`/abende/${id}/finden$`));
  await expect(mira.locator("#finden")).toContainText("Ihr Erkennungszeichen: grüner Schal");
  await expect(mira.locator("#sicherheit").getByRole("link", { name: /Check-in/ })).toHaveAttribute("href", `/abende/${id}/checkin`);
  await expectAccessible(mira, "/abende/[id]/finden");

  // Rückmeldung: eine Stunde nach Beginn
  await clockTo(new Date(new Date(day5).getTime() + 60 * 60_000).toISOString());
  await mira.goto(`/abende/${id}`);
  await mira.getByRole("link", { name: "Rückmeldung geben" }).click();
  await expect(mira.getByRole("heading", { level: 1, name: "Wie war Ihr Abend?" })).toBeVisible();
  await expectAccessible(mira, "Rückmeldung (leer)");
  await mira.getByRole("group", { name: "Waren Sie dort?" }).getByLabel("Ja").check();
  await mira.getByRole("group", { name: "War Jonas da?" }).getByLabel("Ja").check();
  await mira.getByRole("group", { name: /Würden Sie Jonas gern wiedersehen/ }).getByLabel("Ja").check();
  await mira.getByRole("group", { name: "Haben Sie sich sicher gefühlt?" }).getByLabel("Ja").check();
  await mira.getByRole("group", { name: /Wie war das Lokal/ }).getByLabel(/sehr gut/).check();
  await mira.getByRole("group", { name: "Möchten Sie Kontaktdaten tauschen?" }).getByLabel("Ja, Kontakt teilen").check();
  await mira.getByLabel("Telefonnummer").check();
  await expect(mira.getByText("Einwilligung zum Kontakttausch")).toBeVisible();
  await expectAccessible(mira, "Rückmeldung (ausgefüllt)");
  await mira.getByRole("button", { name: "Rückmeldung senden" }).click();
  await expect(mira.getByText(/Bitte setzen Sie das Häkchen bei der Einwilligung/)).toBeVisible();
  await mira.getByLabel("Ich habe den Text gelesen und willige ein.").check();
  await mira.getByRole("button", { name: "Rückmeldung senden" }).click();
  await expect(mira.getByText("Danke für die Rückmeldung.")).toBeVisible();
  await expect(mira.locator("#kontakt")).toContainText("Ihr Ja ist gespeichert");
  await expect(mira.locator("#nachbesprechung")).toContainText("Etwa 10 Minuten");
  await expectAccessible(mira, "Nach der Rückmeldung");

  // Jonas: Ja, nur E-Mail
  await jonas.goto(`/abende/${id}/rueckmeldung`);
  await jonas.getByRole("group", { name: "Waren Sie dort?" }).getByLabel("Ja").check();
  await jonas.getByRole("group", { name: "Möchten Sie Kontaktdaten tauschen?" }).getByLabel("Ja, Kontakt teilen").check();
  await jonas.getByLabel("Ich habe den Text gelesen und willige ein.").check();
  await jonas.getByRole("button", { name: "Rückmeldung senden" }).click();
  await expect(jonas.getByRole("heading", { name: "Mira möchte auch Kontakt" })).toBeVisible();
  await expect(jonas.locator("#kontakt")).toContainText(seed.a.email);
  await expect(jonas.locator("#kontakt")).toContainText("+49 170 1234567");

  // Mira sieht nur, was Jonas freigegeben hat (E-Mail, kein Telefon)
  await mira.goto(`/abende/${id}/kontakt`);
  const contact = mira.locator("#kontakt");
  await expect(contact).toContainText("Jonas möchte auch Kontakt");
  await expect(contact.getByRole("link", { name: seed.b.email })).toHaveAttribute("href", `mailto:${seed.b.email}`);
  await expect(contact.locator("dl")).not.toContainText("Telefon");
  await expect(contact.locator("dl")).not.toContainText("+49");
  await expectAccessible(mira, "/abende/[id]/kontakt");
  expect((await eveningRow(id)).state).toBe("happened");

  // Nachbesprechung führt zum Gespräch mit Viola
  await giveConsent(seed.a.id, "gespraech");
  await mira.goto(`/abende/${id}`);
  await mira.locator("#nachbesprechung").getByRole("link", { name: "Nachbesprechung beginnen" }).click();
  await expect(mira).toHaveURL(new RegExp(`/gespraech\\?art=nachbesprechung&abend=${id}$`));
  await expect(mira.locator("#art")).toContainText("Nachbesprechung");
  await expect(mira.locator("#art")).toContainText("etwa 10 Minuten");
  consoleA.expectClean();
  consoleB.expectClean();
});

test("Ablehnen: Grund nur für Fermata, das Gegenüber sieht nur das Ende", async ({ browser }) => {
  const seed = await proposedEvening();
  const jonas = await pageFor(browser, seed.b.email);
  const console = watchConsole(jonas);
  await jonas.goto(`/abende/${seed.eveningId}`);
  await jonas.getByRole("button", { name: "Ablehnen" }).click();
  const dialog = jonas.getByRole("dialog", { name: "Vorschlag ablehnen?" });
  await expect(dialog).toContainText("Mira erfährt nur, dass aus dem Vorschlag diesmal kein Abend wird");
  await dialog.getByLabel("Keine der Uhrzeiten passt").check();
  await expectAccessible(jonas, "Dialog Ablehnen");
  await dialog.getByRole("button", { name: "Ja, ablehnen" }).click();
  await expect(jonas.getByText("Sie haben den Vorschlag abgelehnt.")).toBeVisible();
  const [row] = await sql`select state, cancel_reason from app.evenings where id = ${seed.eveningId}::uuid`;
  expect(row).toMatchObject({ state: "declined", cancel_reason: "termin" });

  const mira = await pageFor(browser, seed.a.email);
  await mira.goto("/abende");
  await expect(mira.getByRole("heading", { name: "Vergangene" })).toBeVisible();
  await expect(mira.locator(`a[href="/abende/${seed.eveningId}"]`)).toContainText("abgelehnt");
  await mira.goto(`/abende/${seed.eveningId}`);
  await expect(mira.getByText("Aus diesem Vorschlag wird diesmal kein Abend.")).toBeVisible();
  await expect(mira.locator("main")).not.toContainText("Uhrzeiten passt");
  await expectAccessible(mira, "Abgelehnt (Gegenüber)");
  console.expectClean();
});
