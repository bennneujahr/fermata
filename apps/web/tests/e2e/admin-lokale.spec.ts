// Admin „Lokale & Plätze“: Lokal anlegen (Ort und Koordinaten aus der PLZ), ändern, Plätze anlegen und pflegen,
// deaktivieren; Zeitraum anlegen; Abend mit bestrittenem Nichterscheinen klären.
import { expect, test } from "@playwright/test";
import { adminSession, type AdminSession } from "./helpers/admin";
import { confirmedEvening, fixtureVenue, memberPair } from "./helpers/admin-fixtures";
import { sql } from "./helpers/backend";
import { expectAccessible, watchConsole } from "./helpers/checks";

test.describe.configure({ mode: "serial" });

let admin: AdminSession;

test.beforeAll(async ({ browser }) => {
  admin = await adminSession(browser);
});

test("Lokal anlegen, Plätze anlegen, Tische ändern, Platz löschen, deaktivieren", async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: admin.state });
  const page = await ctx.newPage();
  const console = watchConsole(page);
  const name = `Café am Markt ${Date.now().toString(36)}`;

  await page.goto("/admin/lokale");
  await expect(page.getByRole("heading", { level: 1, name: "Lokale & Plätze" })).toBeVisible();
  await expectAccessible(page, "/admin/lokale");
  await page.getByRole("link", { name: "Neues Lokal" }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "Neues Lokal" })).toBeVisible();
  await expectAccessible(page, "/admin/lokale/neu");

  // Fehler aus der Datenbank: E-Mail-Reservierung ohne Adresse
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Straße und Hausnummer").fill("Am Markt 3");
  await page.getByLabel("Postleitzahl").fill("23966");
  await page.getByRole("button", { name: "Lokal anlegen" }).click();
  await expect(page.getByText("Für Reservierungen per E-Mail fehlt die Adresse.")).toBeVisible();
  await page.getByLabel(/E-Mail für Reservierungen/).fill("reservierung@cafe-am-markt.example");
  await page.getByLabel(/Barrierefreiheit/).fill("Stufenloser Eingang");
  await page.getByLabel(/Anfahrt mit Bus und Bahn/).fill("Bus 230, Haltestelle Markt");
  await page.getByLabel(/Hinweis in der Reservierungs-Mail/).fill("Bitte den Tisch am Fenster");
  await page.getByLabel("Personal eingewiesen (Sicherheitsstandard 14)").check();
  await page.getByRole("button", { name: "Lokal anlegen" }).click();
  await expect(page).toHaveURL(/\/admin\/lokale\/[0-9a-f-]{36}\?angelegt=1/);
  await expect(page.getByText("Lokal angelegt.")).toBeVisible();
  const venueId = page.url().match(/lokale\/([0-9a-f-]{36})/)![1]!;
  const [v] = await sql`select city, lat, lon, agreement, accessibility from app.venues where id = ${venueId}::uuid`;
  const [plz] = await sql`select place_name, lat, lon from app.postal_codes where postal_code = '23966'`;
  expect(v).toMatchObject({ city: plz!.place_name, accessibility: "Stufenloser Eingang" });
  expect(Number(v!.lat)).toBeCloseTo(Number(plz!.lat), 3);
  expect(v!.agreement).toMatchObject({ reservation_note: "Bitte den Tisch am Fenster", personal_eingewiesen: true });
  await expectAccessible(page, "/admin/lokale/[id]");

  // Ändern
  const form = page.getByTestId("venue-form");
  await form.getByLabel(/Telefon/).fill("03841 123456");
  await form.getByRole("button", { name: "Änderungen speichern" }).click();
  await expect(form.getByText("Gespeichert.")).toBeVisible();
  expect((await sql`select contact_phone from app.venues where id = ${venueId}::uuid`)[0]!.contact_phone).toBe("03841 123456");

  // Plätze: 2 Wochen, Do und Fr, zwei Uhrzeiten, 2 Tische
  const slots = page.getByTestId("slot-form");
  await slots.getByLabel("Wochen").fill("2");
  await slots.getByLabel("Samstag").uncheck();
  await slots.getByLabel("Uhrzeiten").fill("19:00, 20:30");
  await slots.getByRole("button", { name: "Plätze anlegen" }).click();
  await expect(slots.getByText(/\d+ angelegt, 0 geändert, 0 übersprungen\./)).toBeVisible();
  const [{ n }] = (await sql`select count(*)::int as n from app.venue_slots where venue_id = ${venueId}::uuid`) as unknown as [{ n: number }];
  expect(n).toBeGreaterThanOrEqual(6);
  const table = page.getByRole("table", { name: "Plätze der nächsten Wochen" });
  await expect(table.locator("tbody tr")).toHaveCount(n);
  for (const t of await table.locator("tbody tr th").allTextContents()) expect(t).toMatch(/^(Do|Fr)\.,.*(19:00|20:30)$/);

  // Tische ändern und einen Platz löschen
  const row = table.locator("tbody tr").first();
  await row.getByLabel(/^Tische /).fill("4");
  await row.getByRole("button", { name: "Ändern" }).click();
  await expect(row.getByText("Geändert.")).toBeVisible();
  await expect(table.locator("tbody tr").first().locator("td.num").first()).toHaveText("4");
  await table.locator("tbody tr").nth(1).getByRole("button", { name: "Löschen" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Löschen" }).click();
  await expect(table.locator("tbody tr")).toHaveCount(n - 1);

  // Deaktivieren (mit Rückfrage) und wieder aktivieren
  await page.getByRole("button", { name: "Deaktivieren" }).click();
  await expect(page.getByRole("dialog", { name: "Lokal deaktivieren?" })).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Deaktivieren" }).click();
  await expect(page.getByText("Das Lokal ist inaktiv")).toBeVisible();
  expect((await sql`select active from app.venues where id = ${venueId}::uuid`)[0]!.active).toBe(false);
  await page.getByRole("button", { name: "Wieder aktivieren" }).click();
  await expect(page.getByText("Das Lokal ist aktiv")).toBeVisible();

  // Liste
  await page.getByRole("navigation", { name: /Lokale & Plätze: Bereich/ }).getByRole("link", { name: "Lokale" }).click();
  await expect(page.getByRole("link", { name })).toBeVisible();
  const [audit] = await sql`select count(*)::int as n from ops.audit_log where target_id = ${venueId} and action like 'venue.%'`;
  expect(audit!.n).toBeGreaterThanOrEqual(4);
  console.expectClean();
  await ctx.close();
});

test("Zeitraum anlegen und Abend mit bestrittenem Nichterscheinen klären", async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: admin.state });
  const page = await ctx.newPage();
  const console = watchConsole(page);

  // Zeitraum (ohne Nachricht an Mitglieder), Beginn weit in der Zukunft, damit er eindeutig ist
  const start = new Date(Date.now() + (400 + Math.floor(Math.random() * 300)) * 86400000).toISOString().slice(0, 10);
  await page.goto("/admin/lokale/zeitraeume");
  await expect(page.getByRole("heading", { level: 1, name: "Zeiträume" })).toBeVisible();
  await expectAccessible(page, "/admin/lokale/zeitraeume");
  await page.getByLabel(/Beginn/).fill(start);
  await page.getByLabel("Mitglieder sofort nach ihren freien Zeiten fragen").uncheck();
  await page.getByRole("button", { name: "Zeitraum anlegen" }).click();
  await expect(page.getByText("Zeitraum angelegt.")).toBeVisible();
  expect((await sql`select count(*)::int as n from app.availability_periods where starts_on = ${start}::date`)[0]!.n).toBe(1);
  await page.getByLabel(/Beginn/).fill(start);
  await page.getByRole("button", { name: "Zeitraum anlegen" }).click();
  await expect(page.getByText("Diesen Zeitraum gibt es schon.")).toBeVisible();

  // Abend: bestrittenes Nichterscheinen → Benn legt fest
  const venue = await fixtureVenue();
  const { a, b } = await memberPair("Karla", "Lenz");
  const evening = await confirmedEvening(a.id, b.id, venue, "-20 hours");
  await sql`select app.evening_flag(${evening}::uuid, null, 'no_show_bestritten', 'niedrig', '{}'::jsonb)`;
  await page.goto("/admin/lokale/abende");
  await expect(page.getByRole("heading", { level: 1, name: "Abende klären" })).toBeVisible();
  const card = page.locator(`#abend-${evening}`);
  await expect(card).toHaveAccessibleName(/Karla/);
  await expect(card.getByText("Nichterscheinen bestritten")).toBeVisible();
  await expectAccessible(page, "/admin/lokale/abende");
  await card.getByLabel("Lenz nicht erschienen").check();
  await card.getByLabel("Notiz (intern)").fill("Lokal hat bestätigt, dass nur eine Person da war.");
  await card.getByRole("button", { name: "Ergebnis festlegen" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Festlegen" }).click();
  await expect(page.locator(`#abend-${evening}`)).toHaveCount(0);
  const [e] = await sql`select state, no_show_user from app.evenings where id = ${evening}::uuid`;
  expect(e).toMatchObject({ state: "no_show", no_show_user: b.id });
  const [f] = await sql`select reviewed_at from safety.safety_flags where kind = 'no_show_bestritten' and details ->> 'evening_id' = ${evening}`;
  expect(f!.reviewed_at).not.toBeNull();
  console.expectClean();
  await ctx.close();
});
