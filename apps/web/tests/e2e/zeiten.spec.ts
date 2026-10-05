// Freie Abende: Raster je Zeitraum, Klick, Ziehen, Tastatur, Prüfregeln, Speichern über api.set_availability.
import { expect, test } from "@playwright/test";
import { sql } from "./helpers/backend";
import { expectAccessible, watchConsole } from "./helpers/checks";
import { berlinAt, currentPeriod, member } from "./helpers/abende";
import { loginByLink } from "./helpers/member";
import { formatDateKeyLong, formatDateKeyShort } from "../../src/lib/berlin";

async function dayKey(day: number): Promise<string> {
  const [row] = await sql`select to_char((now() at time zone 'Europe/Berlin')::date + ${day}::int, 'YYYY-MM-DD') as d`;
  return row!.d as string;
}
const dayLabel = async (day: number) => formatDateKeyLong(await dayKey(day));

test("Freie Abende eintragen: Raster, Klick, Tastatur, Ziehen, zu kurzes Fenster, Speichern", async ({ page }) => {
  const console = watchConsole(page);
  const periodId = await currentPeriod();
  const m = await member("Mira");
  await loginByLink(page, m.email);

  // Einstieg über die Abende, /zeiten leitet zum offenen Zeitraum
  await page.goto("/abende");
  await expect(page.locator("#freie-abende")).toContainText("Freie Abende");
  await page.locator("#freie-abende").getByRole("link", { name: "Freie Abende eintragen" }).click();
  await expect(page).toHaveURL(new RegExp(`/zeiten/${periodId}$`));
  await expect(page.getByRole("heading", { level: 1, name: "Freie Abende" })).toBeVisible();
  await expect(page.getByText(/^Bitte eintragen bis /)).toBeVisible();
  await expectAccessible(page, "/zeiten (leer)");

  const day3 = await dayLabel(3);
  const day4 = await dayLabel(4);
  const cell = (day: string, from: string, to: string) => page.getByRole("button", { name: `${day}, ${from} bis ${to}`, exact: true });

  // Ein Feld an und wieder aus
  await cell(day3, "17:00", "17:30").click();
  await cell(day3, "17:00", "17:30").click(); // an und wieder aus
  await expect(cell(day3, "17:00", "17:30")).toHaveAttribute("aria-pressed", "false");

  // Tag 3: 18:30–21:30 per Tastatur (Leertaste, Pfeil nach unten)
  await cell(day3, "18:30", "19:00").focus();
  await page.keyboard.press("Space");
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Space");
  }
  await expect(cell(day3, "21:00", "21:30")).toHaveAttribute("aria-pressed", "true");
  await expect(cell(day3, "21:00", "21:30")).toBeFocused();

  // Tag 4: nur eine Stunde → Hinweis „kürzer als 2 Stunden“, Speichern gesperrt
  await cell(day4, "19:00", "19:30").click();
  await cell(day4, "19:30", "20:00").click();
  await expect(page.locator(".window-list")).toContainText("ist kürzer als 2 Stunden");
  await expect(page.getByRole("button", { name: "Zeiten speichern" })).toBeDisabled();
  await expectAccessible(page, "/zeiten (Hinweis zu kurz)");

  // Mit der Maus ziehen: Tag 4 bis 21:00 verlängern
  const from = await cell(day4, "20:00", "20:30").boundingBox();
  const to = await cell(day4, "20:30", "21:00").boundingBox();
  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
  await page.mouse.down();
  await page.mouse.move(to!.x + to!.width / 2, to!.y + to!.height / 2, { steps: 4 });
  await page.mouse.up();
  await expect(cell(day4, "20:30", "21:00")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".window-list")).not.toContainText("kürzer");

  await page.getByRole("button", { name: "Zeiten speichern" }).click();
  await expect(page.getByText("Gespeichert. Sie können die Zeiten bis zum Ende der Abfrage ändern.")).toBeVisible();
  const rows = await sql`select starts_at, ends_at from app.availability_windows where user_id = ${m.id}::uuid and period_id = ${periodId}::uuid order by starts_at`;
  expect(rows.map((r) => [(r.starts_at as Date).toISOString().replace(".000", ""), (r.ends_at as Date).toISOString().replace(".000", "")])).toEqual([
    [await berlinAt(3, "18:30"), await berlinAt(3, "21:30")],
    [await berlinAt(4, "19:00"), await berlinAt(4, "21:00")],
  ]);
  await expectAccessible(page, "/zeiten (gespeichert)");

  // Neu laden: das Raster zeigt die gespeicherten Fenster
  await page.reload();
  await expect(cell(day3, "18:30", "19:00")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".window-list")).toContainText(`${day4}, 19:00 bis 21:00 Uhr`);
  console.expectClean();
});

test("Freie Abende: ganzer Abend, Abfrage schließt (Fehler aus der Datenbank), danach nur lesbar", async ({ page }) => {
  const console = watchConsole(page);
  const periodId = await currentPeriod();
  const m = await member("Jonas");
  await loginByLink(page, m.email);
  await page.goto(`/zeiten/${periodId}`);
  const day5 = await dayLabel(5);
  // Ganzer Abend (17–23 Uhr) über die Spaltenüberschrift
  await page.getByRole("button", { name: `Ganzer Abend am ${formatDateKeyShort(await dayKey(5))}` }).click();
  await expect(page.getByRole("button", { name: `${day5}, 22:30 bis 23:00`, exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".window-list")).toContainText(`${day5}, 17:00 bis 23:00 Uhr`);
  // Die Abfrage schließt, während die Person noch einträgt
  const [old] = await sql`select answer_until from app.availability_periods where id = ${periodId}::uuid`;
  await sql`update app.availability_periods set answer_until = now() - interval '1 minute' where id = ${periodId}::uuid`;
  try {
    await page.getByRole("button", { name: "Zeiten speichern" }).click();
    await expect(page.getByText("Die Abfrage ist schon abgeschlossen.")).toBeVisible();
    await expectAccessible(page, "/zeiten (Fehler)");
    await page.reload();
    await expect(page.getByText(/Die Abfrage für diesen Zeitraum ist abgeschlossen/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Zeiten speichern" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: `${day5}, 19:00 bis 19:30`, exact: true })).toHaveAttribute("aria-disabled", "true");
    await expectAccessible(page, "/zeiten (abgeschlossen)");
  } finally {
    await sql`update app.availability_periods set answer_until = ${old!.answer_until} where id = ${periodId}::uuid`;
  }
  console.expectClean();
});
