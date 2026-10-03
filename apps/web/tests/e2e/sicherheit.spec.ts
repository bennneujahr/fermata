// Sicherheit: Melden aus einem Abend (Seite und ReportButton-Dialog), Drossel, eigene Meldungen, Widerspruch,
// Abend teilen (Link → öffentliche Seite → zurückziehen), Check-in „Ich brauche Hilfe“, Hilfe-Seite.
// Auf jeder Seite axe (WCAG 2.1 AA) und CSP-Prüfung.
import { expect, test } from "@playwright/test";
import { sql } from "./helpers/backend";
import { expectAccessible, watchConsole } from "./helpers/checks";
import { loginByLink, onboardedMember } from "./helpers/member";
import { confirmedEvening, sanction } from "./helpers/ui-b";

test("Melden aus einem Abend: Gegenüber, Null-Toleranz-Hinweis, ruhige Bestätigung, eigene Meldungen", async ({ page }) => {
  const c = watchConsole(page);
  const me = await onboardedMember({ first: "Mira" });
  const other = await onboardedMember({ first: "Jonas" });
  const e = await confirmedEvening(me.id, other.id);
  await loginByLink(page, me.email);

  await page.goto(`/sicherheit/melden?abend=${e.eveningId}`);
  await expect(page.getByRole("heading", { level: 1, name: "Etwas melden" })).toBeVisible();
  await expect(page.getByText(new RegExp(`Zum Abend .*${e.venueName}`))).toBeVisible();
  await expect(page.getByRole("radio", { name: "Mein Gegenüber (Jonas)" })).toBeChecked();
  await expect(page.getByText(/sperren wir das Konto der gemeldeten Person sofort vorläufig/)).toBeVisible();
  await expect(page.getByRole("link", { name: "110 anrufen" })).toHaveAttribute("href", "tel:110");
  await expectAccessible(page, "/sicherheit/melden?abend");

  // Ohne Art: Hinweis, Fokus auf der ersten Möglichkeit
  await page.getByRole("button", { name: "Meldung abschicken" }).click();
  await expect(page.getByText("Bitte wählen Sie aus, was passiert ist.")).toBeVisible();
  await expect(page.getByRole("radio", { name: /Übergriff/ })).toBeFocused();
  await expectAccessible(page, "Melden mit Fehler");

  await page.getByRole("radio", { name: /Belästigung/ }).check();
  await page.getByRole("textbox", { name: /Beschreibung/ }).fill("Er hat mich nach dem Abend mehrfach angesprochen.");
  await expect(page.getByText("49 von 4000 Zeichen")).toBeVisible();
  await page.getByRole("button", { name: "Meldung abschicken" }).click();
  await expect(page.getByRole("heading", { name: "Danke. Ihre Meldung ist bei uns." })).toBeVisible();
  await expect(page.getByText(/Die gemeldete Person erfährt nicht, wer gemeldet hat/)).toBeVisible();
  await expectAccessible(page, "Meldung eingegangen");

  const [r] = await sql`select reporter, reported, evening_id, context, category, related, wants_contact, severity from safety.reports where reporter = ${me.id}::uuid`;
  expect(r).toMatchObject({ reported: other.id, evening_id: e.eveningId, context: "abend", category: "belaestigung", related: true, wants_contact: true, severity: "hoch" });
  // Belästigung ist keine Null-Toleranz: keine vorläufige Sperre
  const [s] = await sql`select count(*)::int as n from safety.sanctions where user_id = ${other.id}::uuid`;
  expect(s!.n).toBe(0);

  await page.getByRole("link", { name: "Ihre Meldungen ansehen" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Ihre Meldungen" })).toBeVisible();
  const item = page.getByRole("listitem").filter({ hasText: "Belästigung" });
  await expect(item.getByText("eingegangen")).toBeVisible();
  await expect(item.getByText(/Antwort in der Regel bis/)).toBeVisible();
  await expectAccessible(page, "/sicherheit/meldungen");
  c.expectClean();
});

test("ReportButton im Check-in: Dialog meldet zum Abend, ohne Bezug zum Gegenüber; Drossel wird erklärt", async ({ page }) => {
  const c = watchConsole(page);
  const me = await onboardedMember({ first: "Mira" });
  const other = await onboardedMember({ first: "Jonas" });
  const e = await confirmedEvening(me.id, other.id, { startsInMinutes: 90 });
  await loginByLink(page, me.email);
  await page.goto(`/abende/${e.eveningId}/checkin`);
  await page.getByRole("button", { name: "Etwas melden" }).click();
  const dialog = page.getByRole("dialog", { name: "Etwas melden" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("radio", { name: "Mein Gegenüber (Jonas)" })).toBeChecked();
  await expectAccessible(page, "Melden-Dialog");
  await dialog.getByRole("radio", { name: "Etwas anderes, zum Beispiel das Lokal" }).check();
  await dialog.getByRole("radio", { name: /Ungutes Gefühl/ }).check();
  await dialog.getByRole("checkbox", { name: /melden Sie sich bei mir/ }).uncheck();
  await dialog.getByRole("button", { name: "Meldung abschicken" }).click();
  await expect(dialog.getByRole("heading", { name: "Danke. Ihre Meldung ist bei uns." })).toBeVisible();
  const [r] = await sql`select reported, evening_id, category, wants_contact from safety.reports where reporter = ${me.id}::uuid`;
  expect(r).toMatchObject({ reported: null, evening_id: e.eveningId, category: "unangenehm", wants_contact: false });
  await dialog.getByRole("button", { name: "Schließen" }).click();
  await expect(dialog).toBeHidden();

  // Drossel: nach safety.report_rate_limit_per_day (5) Meldungen freundliche Erklärung mit 110
  await sql.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: me.id, role: "authenticated" })}, true)`;
    await tx`set local role authenticated`;
    for (let i = 0; i < 4; i++) await tx`select api.report('sonstiges', 'sonstiges', null, null, ${`Test ${i}`}, false)`;
  });
  await page.getByRole("button", { name: "Etwas melden" }).click();
  await dialog.getByRole("radio", { name: /Nicht erschienen/ }).check();
  await dialog.getByRole("button", { name: "Meldung abschicken" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Sie haben heute schon mehrere Meldungen geschickt.");
  await expect(dialog.getByRole("alert")).toContainText("110");
  await expectAccessible(page, "Melden gedrosselt");
  c.expectClean();
});

test("Widerspruch gegen einen Hinweis; Mail-Link /konto/sicherheit führt dorthin", async ({ page }) => {
  const c = watchConsole(page);
  const me = await onboardedMember({ first: "Rita" });
  await sanction(me.id, "hinweis", "Bitte achten Sie in der Terminabstimmung auf einen freundlichen Ton.");
  await loginByLink(page, me.email);
  await page.goto("/sicherheit");
  await expect(page.getByRole("heading", { level: 1, name: "Sicherheit" })).toBeVisible();
  await expect(page.getByText("1 Hinweis oder Sperre")).toBeVisible();
  await expectAccessible(page, "/sicherheit");

  await page.goto("/konto/sicherheit");
  await expect(page).toHaveURL(/\/sicherheit\/sanktionen$/);
  await expect(page.getByRole("heading", { name: "Hinweis", exact: true })).toBeVisible();
  await expect(page.getByText("Bitte achten Sie in der Terminabstimmung auf einen freundlichen Ton.")).toBeVisible();
  await expectAccessible(page, "/sicherheit/sanktionen");
  const box = page.getByLabel("Warum halten Sie die Entscheidung für falsch?");
  await box.fill("Zu kurz");
  await page.getByRole("button", { name: "Widerspruch abschicken" }).click();
  await expect(page.getByText("Bitte schreiben Sie zwischen 10 und 4000 Zeichen.")).toBeVisible();
  await box.fill("Ich war nur kurz angebunden, weil ich krank war. Das tut mir leid.");
  await page.getByRole("button", { name: "Widerspruch abschicken" }).click();
  await expect(page.getByRole("heading", { name: "Widerspruch", exact: true })).toBeVisible();
  await expect(page.getByText("eingegangen", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Widerspruch abschicken" })).toHaveCount(0);
  const [a] = await sql`select status, text from safety.appeals where user_id = ${me.id}::uuid`;
  expect(a).toMatchObject({ status: "open", text: "Ich war nur kurz angebunden, weil ich krank war. Das tut mir leid." });
  await expectAccessible(page, "Widerspruch eingegangen");
  c.expectClean();
});

test("Abend teilen: Link erstellen, öffentliche Seite zeigt nur Lokal, Zeit und Vornamen, zurückziehen", async ({ page, browser, context }) => {
  const c = watchConsole(page);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const me = await onboardedMember({ first: "Mira" });
  const other = await onboardedMember({ first: "Jonas" });
  const e = await confirmedEvening(me.id, other.id, { venueName: "Bistro Lindenhof" });
  await loginByLink(page, me.email);
  await page.goto("/sicherheit/teilen");
  await expect(page.getByRole("heading", { level: 1, name: "Abend teilen" })).toBeVisible();
  await expect(page.getByText("Nichts über Ihr Gegenüber – weder Name noch Foto noch Kontakt.")).toBeVisible();
  const card = page.getByRole("region", { name: /Bistro Lindenhof/ });
  await expect(card).toBeVisible();
  await expectAccessible(page, "/sicherheit/teilen");

  await card.getByRole("button", { name: "Link erstellen" }).click();
  const input = card.getByLabel("Link für Ihre Vertrauensperson");
  await expect(input).toHaveValue(/\/teilen#t=[A-Za-z0-9_=-]{20,}$/);
  const link = await input.inputValue();
  await card.getByRole("button", { name: "Link kopieren" }).click();
  await expect(card.getByRole("status")).toHaveText("Kopiert.");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);
  await expect(card.getByText(/erstellt .*gültig bis/)).toBeVisible();
  await expectAccessible(page, "Link erstellt");

  // Öffentliche Seite ohne Anmeldung
  const anon = await browser.newContext();
  const pub = await anon.newPage();
  const pc = watchConsole(pub);
  await pub.goto(link);
  await expect(pub.getByRole("heading", { level: 1, name: "Mira hat einen Abend mit Ihnen geteilt" })).toBeVisible();
  await expect(pub.getByText("Bistro Lindenhof")).toBeVisible();
  await expect(pub.getByText("Seestraße 1")).toBeVisible();
  await expect(pub.getByText("Anfahrt: Bus 10, Haltestelle Markt")).toBeVisible();
  await expect(pub.getByRole("link", { name: "030 12074182 anrufen" })).toHaveAttribute("href", "tel:03012074182");
  await expect(pub.getByRole("link", { name: "Polizei-Notruf 110 anrufen" })).toHaveAttribute("href", "tel:110");
  await expect(pub.getByText(/Dieser Link gilt bis/)).toBeVisible();
  const body = await pub.locator("main").innerText();
  expect(body).not.toContain("Jonas");
  expect(body).not.toContain("Mertens");
  await expect(pub.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expect(pub.locator('meta[name="referrer"]')).toHaveAttribute("content", "no-referrer");
  await expectAccessible(pub, "/teilen (gültig)");

  // Zurückziehen → öffentliche Seite zeigt nichts mehr
  await card.getByRole("button", { name: "Zurückziehen" }).click();
  await expect(card.getByText("Kein aktiver Link.")).toBeVisible();
  await pub.reload();
  await expect(pub.getByRole("heading", { level: 1, name: "Dieser Link ist nicht mehr gültig" })).toBeVisible();
  await expectAccessible(pub, "/teilen (zurückgezogen)");
  const [t] = await sql`select count(*)::int as n from app.trust_shares where evening_id = ${e.eveningId}::uuid and revoked_at is not null`;
  expect(t!.n).toBe(1);
  pc.expectClean();
  await anon.close();

  // Einstieg aus einem Abend: ?abend=<id>
  await page.goto(`/sicherheit/teilen?abend=${e.eveningId}`);
  await expect(page.getByRole("region", { name: /Bistro Lindenhof/ })).toBeVisible();
  c.expectClean();
});

test("Check-in „Ich brauche Hilfe“: Notrufnummern sofort groß, Fermata informiert", async ({ page }) => {
  const c = watchConsole(page);
  const me = await onboardedMember({ first: "Mira" });
  const other = await onboardedMember({ first: "Jonas" });
  const e = await confirmedEvening(me.id, other.id, { startsInMinutes: 60 });
  await loginByLink(page, me.email);
  // Schreibweise aus den Mitteilungen leitet weiter
  await page.goto(`/abende/${e.eveningId}/check-in`);
  await expect(page).toHaveURL(new RegExp(`/abende/${e.eveningId}/checkin$`));
  await expect(page.getByRole("heading", { level: 1, name: "Wie geht es Ihnen?" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Alles gut" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Ich bin unsicher" })).toBeVisible();
  await expectAccessible(page, "/abende/[id]/checkin");

  await page.getByRole("button", { name: "Ich brauche Hilfe" }).click();
  await expect(page.getByRole("heading", { name: "Bei Gefahr: Rufen Sie jetzt 110" })).toBeFocused();
  await expect(page.getByRole("link", { name: "Polizei-Notruf 110 anrufen" })).toHaveAttribute("href", "tel:110");
  await expect(page.locator(".urgent-help__number")).toHaveText("110");
  await expect(page.getByRole("link", { name: "Notruf 112 anrufen" })).toHaveAttribute("href", "tel:112");
  await expect(page.getByRole("link", { name: /030 12074182 anrufen/ })).toHaveAttribute("href", "tel:03012074182");
  await expect(page.getByText("Fermata ist informiert.")).toBeVisible();
  await expectAccessible(page, "Check-in Hilfe");
  const [ci] = await sql`select status from safety.checkins where evening_id = ${e.eveningId}::uuid and user_id = ${me.id}::uuid`;
  expect(ci!.status).toBe("hilfe");
  const [f] = await sql`select severity from safety.safety_flags where kind = 'checkin_hilfe' and user_id = ${me.id}::uuid`;
  expect(f!.severity).toBe("akut");

  // Andere Antwort: „Alles gut“
  await page.getByRole("button", { name: "Andere Antwort geben" }).click();
  await page.getByRole("button", { name: "Alles gut" }).click();
  await expect(page.getByRole("heading", { name: "Danke. Schönen Abend noch." })).toBeVisible();
  // Fremder Abend: nicht gefunden, 110 bleibt sichtbar
  await page.goto("/abende/00000000-0000-0000-0000-000000000000/checkin");
  await expect(page.getByRole("heading", { name: "Diesen Abend finden wir nicht" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Polizei-Notruf 110 anrufen" })).toBeVisible();
  c.expectClean();
});

test("Hilfe angemeldet: alle Nummern aus api.help_contacts(), Wege zu Melden und Abend teilen", async ({ page }) => {
  const c = watchConsole(page);
  const me = await onboardedMember({ first: "Mira" });
  await loginByLink(page, me.email);
  await page.getByRole("link", { name: "Hilfe und Sicherheit" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Hilfe und Sicherheit" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Polizei-Notruf 110 anrufen" })).toHaveAttribute("href", "tel:110");
  await expect(page.getByRole("link", { name: "Notruf 112 anrufen" })).toHaveAttribute("href", "tel:112");
  await expect(page.getByRole("link", { name: "116 016 anrufen" })).toHaveAttribute("href", "tel:116016");
  await expect(page.getByRole("link", { name: "0800 111 0 111 anrufen" })).toHaveAttribute("href", "tel:08001110111");
  await expect(page.getByRole("link", { name: "116 123 anrufen" })).toHaveAttribute("href", "tel:116123");
  await expect(page.getByText("Erreichbar So–Do 21–01 Uhr, Fr/Sa 21–03 Uhr")).toBeVisible();
  await expectAccessible(page, "/hilfe (angemeldet)");
  await page.getByRole("link", { name: "Etwas melden" }).click();
  await expect(page).toHaveURL(/\/sicherheit\/melden$/);
  // Ohne Abend: Bereich wählen, Abend optional
  await page.getByRole("radio", { name: "Ein Abend" }).check();
  await expect(page.getByLabel("Um welchen Abend geht es?")).toHaveCount(0);
  c.expectClean();
});

test("Melden mit festem Bereich (?bereich=gespraech): kein Abend, Bereich steht fest", async ({ page }) => {
  const c = watchConsole(page);
  const me = await onboardedMember({ first: "Mira" });
  await loginByLink(page, me.email);
  await page.goto("/sicherheit/melden?bereich=gespraech");
  await expect(page.getByText("Das Gespräch mit Viola")).toBeVisible();
  await expect(page.getByRole("radio", { name: "Ein Abend" })).toHaveCount(0);
  await page.getByRole("radio", { name: /Diskriminierung/ }).check();
  await page.getByRole("button", { name: "Meldung abschicken" }).click();
  await expect(page.getByRole("heading", { name: "Danke. Ihre Meldung ist bei uns." })).toBeVisible();
  const [r] = await sql`select context, category, evening_id from safety.reports where reporter = ${me.id}::uuid`;
  expect(r).toMatchObject({ context: "gespraech", category: "diskriminierung", evening_id: null });
  await expectAccessible(page, "/sicherheit/melden?bereich=gespraech");
  c.expectClean();
});
