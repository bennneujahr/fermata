// Absage eines bestätigten Abends (rechtzeitig und kurzfristig) und Fehler aus der Datenbank (kein Tisch frei).
import { expect, test, type Browser, type Page } from "@playwright/test";
import { magicLinkPath, sql } from "./helpers/backend";
import { expectAccessible, watchConsole } from "./helpers/checks";
import { asMember, clockTo, confirmedEvening, eveningRow, proposedEvening, resetClock } from "./helpers/abende";

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

test("Absage rechtzeitig: Folgen erklärt, Gegenüber sieht nur, dass der Abend nicht stattfindet", async ({ browser }) => {
  const seed = await confirmedEvening();
  const mira = await pageFor(browser, seed.a.email);
  const console = watchConsole(mira);
  await mira.goto(`/abende/${seed.eveningId}`);
  await expect(mira.getByRole("heading", { name: "Der Abend steht" })).toBeVisible();
  await mira.getByRole("button", { name: "Abend absagen" }).click();
  const dialog = mira.getByRole("dialog", { name: "Abend absagen?" });
  await expect(dialog).toContainText(/Bis .* gilt die Absage als rechtzeitig: Sie und Ihr Gegenüber bekommen den Abend zurück./);
  await expect(dialog).toContainText(/Ab .* gilt eine Absage als kurzfristig/);
  await dialog.getByLabel("Krank oder verhindert").check();
  await expectAccessible(mira, "Dialog Absage (rechtzeitig)");
  await dialog.getByRole("button", { name: "Ja, absagen" }).click();
  await expect(mira.getByText("Sie haben den Abend abgesagt.")).toBeVisible();
  const row = await eveningRow(seed.eveningId);
  expect(row.state).toBe("cancelled_early");
  const [r] = await sql`select status from app.evening_reservations where evening_id = ${seed.eveningId}::uuid order by created_at desc limit 1`;
  expect(r!.status).not.toBe("reserved");

  const jonas = await pageFor(browser, seed.b.email);
  await jonas.goto(`/abende/${seed.eveningId}`);
  await expect(jonas.getByText("Der Abend findet nicht statt.")).toBeVisible();
  await expect(jonas.locator("main")).not.toContainText("Krank");
  await expectAccessible(jonas, "Abgesagt (Gegenüber)");
  console.expectClean();
});

test("Absage kurzfristig (weniger als 24 Stunden vorher)", async ({ browser }) => {
  const seed = await confirmedEvening();
  await clockTo(new Date(new Date(seed.startsAt).getTime() - 12 * 3_600_000).toISOString());
  const jonas = await pageFor(browser, seed.b.email);
  const console = watchConsole(jonas);
  await jonas.goto(`/abende/${seed.eveningId}`);
  await expect(jonas.locator(".cancel-area")).toContainText("Eine Absage gilt jetzt als kurzfristig");
  await jonas.getByRole("button", { name: "Abend absagen" }).click();
  const dialog = jonas.getByRole("dialog", { name: "Abend absagen?" });
  await expect(dialog).toContainText("Der Abend zählt für Sie als genutzt, Ihr Gegenüber bekommt ihn zurück.");
  await dialog.getByLabel("Ich fühle mich unsicher").check();
  await expect(dialog.getByRole("link", { name: "Etwas melden" })).toHaveAttribute("href", `/sicherheit/melden?abend=${seed.eveningId}`);
  await expectAccessible(jonas, "Dialog Absage (kurzfristig)");
  await dialog.getByRole("button", { name: "Ja, absagen" }).click();
  await expect(jonas.getByText("Sie haben den Abend abgesagt.")).toBeVisible();
  const [row] = await sql`select state, cancel_reason from app.evenings where id = ${seed.eveningId}::uuid`;
  expect(row).toMatchObject({ state: "cancelled_late", cancel_reason: "sicherheit" });
  console.expectClean();
});

test("Bestätigen scheitert ruhig, wenn im Lokal kein Tisch mehr frei ist", async ({ browser }) => {
  const seed = await proposedEvening();
  const t = seed.proposed[0]!;
  await asMember(seed.a.id, (tx) => tx`select api.evening_request_time(${seed.eveningId}::uuid, array[${t}::timestamptz])`);
  // Der letzte Tisch geht an einen anderen Abend
  await sql`update app.venue_slots set reserved = tables where venue_id = ${seed.venueId}::uuid and starts_at = ${t}::timestamptz`;
  const jonas = await pageFor(browser, seed.b.email);
  const console = watchConsole(jonas);
  await jonas.goto(`/abende/${seed.eveningId}`);
  await jonas.getByRole("button", { name: "Diese Uhrzeit bestätigen" }).click();
  await expect(jonas.getByText("Zu dieser Uhrzeit ist im Lokal leider kein Tisch mehr frei. Bitte eine andere Uhrzeit wählen.")).toBeVisible();
  expect((await eveningRow(seed.eveningId)).state).toBe("time_requested");
  await expectAccessible(jonas, "Kein Tisch frei");
  console.expectClean();
});
