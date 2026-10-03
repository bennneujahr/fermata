// Ablauf Warteliste: Formular → Mail in ops.mail_outbox → Bestätigung → /willkommen (Platz 1)
// → Einladungslink für eine zweite Person → beide rücken vor.
import { latestMail, resetWaitlist, sql } from "../db";
import { confirmFromMail, expect, signUpViaForm, test, uniqueEmail } from "../fixtures";

test.beforeAll(async () => {
  await resetWaitlist();
});

test("Anmeldung, Bestätigung, Einladung und Vorrückung", async ({ page, browser }) => {
  const anna = uniqueEmail("anna");
  await page.goto("/?q=pfaffenteich");
  await expect(page.locator('input[name="source"]')).toHaveValue("pfaffenteich");
  await signUpViaForm(page, { firstName: "Anna", email: anna });
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Bitte bestätigen Sie Ihre Adresse.");

  const mail = await latestMail(anna, "waitlist.confirm");
  expect(mail.subject).toBe("Bitte bestätigen Sie Ihre Anmeldung bei Fermata");
  expect(mail.text).toContain("Guten Tag, Anna,");

  const annaUrl = await confirmFromMail(page, anna);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Willkommen, Anna.");
  await expect(page.locator('[data-part="place"]')).toHaveText("1");
  await expect(page.locator('[data-part="region"]')).toHaveText("Westmecklenburg");
  await expect(page.getByText("Gründungsmitglied", { exact: true })).toBeVisible();
  const welcome = await latestMail(anna, "waitlist.welcome");
  expect(welcome.text).toContain("Zum Zeitpunkt der Bestätigung haben Sie Platz 1");

  const inviteLink = await page.getByLabel("Ihr persönlicher Einladungslink").inputValue();
  expect(inviteLink).toMatch(/^http:\/\/localhost:\d+\/\?e=[A-Z2-9]{8}$/);
  expect(welcome.text).toContain(inviteLink);

  // Zweite Person kommt über den Einladungslink (eigener Browser-Kontext).
  const ben = uniqueEmail("ben");
  const context = await browser.newContext();
  const page2 = await context.newPage();
  await page2.goto(inviteLink);
  await expect(page2.getByText("Sie wurden persönlich eingeladen.")).toBeVisible();
  await signUpViaForm(page2, { firstName: "Ben", email: ben, region: "nordwestmecklenburg", postalCode: "23966" });
  await confirmFromMail(page2, ben);
  await expect(page2.locator('[data-part="place"]')).toHaveText("2");
  await expect(page2.getByText("Sie sind schon 50 Plätze vorgerückt.")).toBeVisible();
  expect(await context.cookies()).toEqual([]);
  await context.close();

  // Anna sieht die genutzte Einladung und ihre Vorrückung.
  await page.goto(annaUrl);
  await page.reload();
  await expect(page.locator('[data-part="place"]')).toHaveText("1");
  await expect(page.getByText("Ihre Einladung wurde genutzt.")).toBeVisible();
  await expect(page.getByText("Sie sind schon 50 Plätze vorgerückt.")).toBeVisible();

  const rows = await sql`select email::text, bonus_steps, source, base_number from public.waitlist order by base_number`;
  expect(rows.map((r) => [r.bonus_steps, r.base_number])).toEqual([
    [1, 1],
    [1, 2],
  ]);
  expect(rows[0]!.source).toBe("pfaffenteich");
  expect(await page.context().cookies()).toEqual([]);
});

test("Gleiche Antwort für eine schon eingetragene Adresse", async ({ page }) => {
  const email = uniqueEmail("doppelt");
  await page.goto("/");
  await signUpViaForm(page, { firstName: "Clara", email });
  await page.goto("/");
  await signUpViaForm(page, { firstName: "Clara", email });
  const [{ n }] = await sql`select count(*)::int as n from ops.mail_outbox where recipient = ${email}`;
  expect(n).toBe(1);
});

test("Kopierknopf kopiert den Einladungslink", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const email = uniqueEmail("kopie");
  await page.goto("/");
  await signUpViaForm(page, { firstName: "Dora", email });
  await confirmFromMail(page, email);
  await page.getByRole("button", { name: "Link kopieren" }).click();
  await expect(page.getByText("Der Link ist kopiert.")).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toBe(await page.getByLabel("Ihr persönlicher Einladungslink").inputValue());
});

test("Abmeldung über die persönliche Seite löscht den Eintrag", async ({ page }) => {
  const email = uniqueEmail("abmelden");
  await page.goto("/");
  await signUpViaForm(page, { firstName: "Emil", email });
  await confirmFromMail(page, email);
  await page.getByRole("link", { name: "Von der Warteliste abmelden" }).click();
  await expect(page).toHaveURL(/\/abmelden#t=/);
  await page.getByRole("button", { name: "Ja, abmelden und löschen" }).click();
  await expect(page).toHaveURL(/\/abgemeldet$/);
  const [{ n }] = await sql`select count(*)::int as n from public.waitlist where email = ${email}`;
  expect(n).toBe(0);
});

test("Abgelaufener oder benutzter Link führt zur Erklärung", async ({ page }) => {
  await page.goto("http://localhost:54331/functions/v1/waitlist-confirm?t=" + "x".repeat(43));
  await expect(page).toHaveURL(/\/bestaetigung-abgelaufen$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Dieser Link gilt nicht mehr.");
});

test("Plakat-Kürzel: zählt und leitet weiter, ohne Cookie", async ({ page }) => {
  await page.goto("/s/pfaffenteich");
  await expect(page).toHaveURL(/\/\?q=pfaffenteich$/);
  await expect(page.locator('input[name="source"]')).toHaveValue("pfaffenteich");
  const [row] = await sql`select count from public.link_hits where slug = 'pfaffenteich'`;
  expect(row?.count).toBeGreaterThanOrEqual(1);
  await page.goto("/s/..%2F..%2Fetc");
  await expect(page).toHaveURL(/\/$/);
  expect(await page.context().cookies()).toEqual([]);
});
