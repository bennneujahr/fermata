// Barrierefreiheit im dunklen Modus: dieselben Seiten wie in den Abläufen, mit prefers-color-scheme: dark.
import { expect, test } from "@playwright/test";
import { expectAccessible, watchConsole } from "./helpers/checks";
import { clockTo, confirmedEvening, currentPeriod, giveConsent, proposedEvening, resetClock } from "./helpers/abende";
import { loginByLink } from "./helpers/member";

test.afterEach(async () => {
  await resetClock();
});

test("Dunkler Modus: Gespräch, freie Abende, Abende, Rückmeldung, Mitteilungen ohne axe-Befund", async ({ page }) => {
  test.setTimeout(120_000);
  const console = watchConsole(page);
  await page.emulateMedia({ colorScheme: "dark" });
  const periodId = await currentPeriod();
  const seed = await confirmedEvening();
  const prop = await proposedEvening({ a: seed.a });
  await giveConsent(seed.a.id, "gespraech");
  await loginByLink(page, seed.a.email);
  await expectAccessible(page, "/start (dunkel)");
  for (const [path, heading] of [
    ["/gespraech", "Gespräch"],
    [`/zeiten/${periodId}`, "Freie Abende"],
    ["/abende", "Abende"],
    [`/abende/${prop.eveningId}`, "Vorschlag: ein Abend mit Jonas"],
    [`/abende/${seed.eveningId}`, "Abend mit Jonas"],
    ["/konto/mitteilungen", "Mitteilungen"],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    await expectAccessible(page, `${path} (dunkel)`);
  }
  await page.goto("/gespraech");
  await page.getByRole("button", { name: "Lieber schreiben" }).click();
  await expect(page.locator(".chat__item--viola").first()).toContainText("Ich bin Viola");
  await expectAccessible(page, "Textgespräch (dunkel)");

  await clockTo(new Date(new Date(seed.startsAt).getTime() - 5 * 60_000).toISOString());
  await page.goto(`/abende/${seed.eveningId}/finden`);
  await expect(page.locator("#finden")).toBeVisible();
  await expectAccessible(page, "Finde-Fenster (dunkel)");
  await clockTo(new Date(new Date(seed.startsAt).getTime() + 2 * 3_600_000).toISOString());
  await page.goto(`/abende/${seed.eveningId}/rueckmeldung`);
  await page.getByRole("group", { name: "Waren Sie dort?" }).getByLabel("Ja").check();
  await page.getByRole("group", { name: "Möchten Sie Kontaktdaten tauschen?" }).getByLabel("Ja, Kontakt teilen").check();
  await expectAccessible(page, "Rückmeldung (dunkel)");
  console.expectClean();
});
