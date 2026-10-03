// Mitgliedschaft: Stufen, Bestellübersicht mit Pflicht-Häkchen und Payment Element (Stripe.js im Test ersetzt,
// Server gegen stripe-mock), Kündigungsknopf (§ 312k BGB) angemeldet und ohne Anmeldung (Link aus der Mail),
// Widerrufsbutton (§ 356a BGB). Auf jeder Seite axe (WCAG 2.1 AA) und CSP-Prüfung.
import { expect, test } from "@playwright/test";
import { sql } from "./helpers/backend";
import { expectAccessible, watchConsole } from "./helpers/checks";
import { loginByLink, onboardedMember } from "./helpers/member";
import { activeMembership, fakeStripe, linkFromMail, waitForOutbox } from "./helpers/ui-b";

const RECEIPT = /\d{2}\.\d{2}\.\d{4}, \d{2}:\d{2}:\d{2} Uhr \((MESZ|MEZ)\)/;

test("Stufen und Bestellung: Übersicht mit Pflichtangaben, Häkchen vor dem Knopf, Payment Element, Ergebnis", async ({ page }) => {
  const c = watchConsole(page);
  await fakeStripe(page);
  const me = await onboardedMember({ first: "Mira" });
  await loginByLink(page, me.email);

  const overview = await page.goto("/mitgliedschaft");
  expect(overview!.headers()["content-security-policy"]).not.toContain("stripe.com");
  await expect(page.getByRole("heading", { level: 1, name: "Mitgliedschaft" })).toBeVisible();
  await expect(page.locator("#stand").getByText("Gratisphase")).toBeVisible();
  const tiers = page.getByRole("region", { name: "Stufen" });
  await expect(tiers.getByRole("heading", { name: "Auftakt" })).toBeVisible();
  await expect(tiers.getByText("49,00 €", { exact: true })).toBeVisible();
  await expect(tiers.getByText("149,00 €")).toBeVisible();
  await expect(tiers.getByText("je 4 Wochen · inkl. 19 % USt").first()).toBeVisible();
  await expect(tiers.getByText("2 Abende je 4 Wochen")).toBeVisible();
  await expect(tiers.getByText("Die Loge ist in der Testphase noch nicht buchbar.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Loge wählen" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Verträge hier kündigen" }).first()).toBeVisible();
  await expectAccessible(page, "/mitgliedschaft (Gratisphase)");

  // Ganzer Seitenaufruf zur Bestellseite: eigene CSP mit Stripe
  const [orderResponse] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith("/mitgliedschaft/bestellen/andante") && r.request().resourceType() === "document"),
    page.getByRole("link", { name: "Andante wählen" }).click(),
  ]);
  const csp = orderResponse.headers()["content-security-policy"]!;
  expect(/frame-src ([^;]+)/.exec(csp)![1]).toContain("https://js.stripe.com");
  expect(/frame-src ([^;]+)/.exec(csp)![1]).toContain("https://hooks.stripe.com");
  expect(/connect-src ([^;]+)/.exec(csp)![1]).toContain("https://api.stripe.com");
  expect(/script-src ([^;]+)/.exec(csp)![1]).toMatch(/'nonce-[^']+' 'strict-dynamic' https:\/\/js\.stripe\.com/);

  await expect(page.getByRole("heading", { level: 1, name: "Bestellübersicht" })).toBeVisible();
  const summary = page.locator("#uebersicht");
  await expect(summary.getByText("149,00 € je 4 Wochen (inkl. 19 % USt)")).toBeVisible();
  await expect(summary.getByText("2 Abende je Zeitraum")).toBeVisible();
  await expect(summary.getByText("4 Wochen, verlängert sich automatisch")).toBeVisible();
  await expect(summary.getByText(/Sie können jederzeit zum Ende des laufenden Zeitraums kündigen/)).toBeVisible();
  await expect(summary.getByText(/innerhalb von 14 Tagen ohne Angabe von Gründen widerrufen/)).toBeVisible();
  await expect(summary.getByRole("link", { name: "Widerrufsbelehrung lesen" })).toHaveAttribute("href", "/rechtliches/widerruf");
  await expect(page.locator("[data-fake-stripe=payment]")).toBeVisible();
  // Payment Element im Modus „Abo“ ohne Client-Geheimnis, Betrag und Währung aus der Übersicht
  const calls = await page.evaluate(() => (window as unknown as { __stripeCalls: Record<string, unknown>[] }).__stripeCalls);
  expect(calls).toContainEqual(expect.objectContaining({ fn: "Stripe", key: "pk_test_fermatalocal", locale: "de" }));
  expect(calls).toContainEqual(expect.objectContaining({ fn: "elements", mode: "subscription", amount: 14900, currency: "eur" }));
  const button = page.getByRole("button", { name: "Mitgliedschaft zahlungspflichtig abschließen", exact: true });
  await expect(button).toBeVisible();
  await expect(button).toHaveText("Mitgliedschaft zahlungspflichtig abschließen");
  // Häkchen steht direkt über dem Knopf
  const checkbox = page.getByRole("checkbox", { name: /vor Ende der Widerrufsfrist mit der Leistung beginnt|Widerrufsfrist/ });
  await expect(checkbox).not.toBeChecked();
  const boxY = (await checkbox.boundingBox())!.y;
  const buttonY = (await button.boundingBox())!.y;
  expect(boxY).toBeLessThan(buttonY);
  await expectAccessible(page, "/mitgliedschaft/bestellen/andante");

  // Ohne Häkchen: blockiert (aria-disabled; ein Klick zeigt nur den Hinweis), keine Bestellung
  await expect(button).toBeDisabled();
  await button.click({ force: true });
  await expect(page.getByText("Bitte setzen Sie das Häkchen, damit wir mit der Mitgliedschaft beginnen können.")).toBeVisible();
  await expect(checkbox).toBeFocused();
  const [none] = await sql`select count(*)::int as n from billing.contract_actions where user_id = ${me.id}::uuid`;
  expect(none!.n).toBe(0);
  await expectAccessible(page, "Bestellung ohne Häkchen");

  // Mit Häkchen: Payment Element prüft, billing-checkout bestellt (stripe-mock), Ergebnisseite
  await checkbox.check();
  await expect(button).toBeEnabled();
  await button.click();
  await expect(page).toHaveURL(/\/mitgliedschaft\/bestellen\/ergebnis\?vertrag=FM-/);
  await expect(page.getByRole("heading", { level: 1, name: "Danke. Ihre Bestellung ist eingegangen." })).toBeVisible();
  const [m] = await sql`select status, tier, contract_number from billing.memberships where user_id = ${me.id}::uuid`;
  expect(m).toMatchObject({ status: "pending", tier: "andante" });
  await expect(page.getByText(m!.contract_number as string)).toBeVisible();
  const [order] = await sql`select details from billing.contract_actions where user_id = ${me.id}::uuid and kind = 'order'`;
  expect(order!.details.button_label).toBe("Mitgliedschaft zahlungspflichtig abschließen");
  expect(order!.details.summary.tier).toBe("andante");
  await waitForOutbox(me.email, "billing.order_received");
  await expectAccessible(page, "Bestellung eingegangen");

  // Übersicht: Bestellung eingegangen, Verlauf mit Zeitpunkt
  await page.goto("/mitgliedschaft");
  await expect(page.locator("#stand").getByText("Bestellung eingegangen")).toBeVisible();
  await expect(page.locator("#verlauf").getByText("Bestellung")).toBeVisible();
  await expect(page.locator("#verlauf").getByText(RECEIPT)).toBeVisible();
  c.expectClean();
});

test("Bestellung: Fehler im Zahlungsfeld blockiert die Bestellung; abgelehnte Zahlung nach Rücksprung", async ({ page }) => {
  const c = watchConsole(page);
  await fakeStripe(page, { submitError: "Ihre Karte wurde abgelehnt." });
  const me = await onboardedMember({ first: "Pia" });
  await loginByLink(page, me.email);
  await page.goto("/mitgliedschaft/bestellen/auftakt");
  await expect(page.locator("[data-fake-stripe=payment]")).toBeVisible();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Mitgliedschaft zahlungspflichtig abschließen" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Ihre Karte wurde abgelehnt." })).toBeVisible();
  const [none] = await sql`select count(*)::int as n from billing.contract_actions where user_id = ${me.id}::uuid`;
  expect(none!.n).toBe(0);
  await expectAccessible(page, "Bestellung mit Fehler im Zahlungsfeld");

  // Rücksprung von Stripe (z. B. nach 3-D Secure) mit fehlgeschlagener Zahlung
  await page.goto("/mitgliedschaft/bestellen/ergebnis?redirect_status=failed");
  await expect(page.getByRole("heading", { level: 1, name: "Die Zahlung hat nicht geklappt" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Zur Mitgliedschaft" })).toBeVisible();
  await expectAccessible(page, "Zahlung fehlgeschlagen");

  // Unbekannte Stufe
  await page.goto("/mitgliedschaft/bestellen/gibtsnicht");
  await expect(page.getByRole("heading", { name: "Diese Stufe gibt es nicht" })).toBeVisible();
  c.expectClean();
});

test("Kündigungsknopf angemeldet: Angaben vorausgefüllt, „Jetzt kündigen“, Eingangsbestätigung mit Datum und Uhrzeit", async ({ page }) => {
  const c = watchConsole(page);
  const me = await onboardedMember({ first: "Mira" });
  const { contractNumber } = await activeMembership(me.id, "andante");
  await loginByLink(page, me.email);
  await page.goto("/mitgliedschaft");
  await expect(page.locator("#stand").getByText("aktiv", { exact: true })).toBeVisible();
  await expect(page.locator("#stand").getByText(contractNumber)).toBeVisible();
  await expect(page.locator("#stand").getByText("Nächste Abbuchung")).toBeVisible();
  await expect(page.getByRole("link", { name: "Andante wählen" })).toHaveCount(0);
  await expectAccessible(page, "/mitgliedschaft (aktiv)");

  await page.locator("#kuendigen").getByRole("link", { name: "Verträge hier kündigen" }).click();
  await expect(page).toHaveURL(/\/mitgliedschaft\/kuendigen$/);
  await expect(page.getByRole("heading", { level: 1, name: "Verträge hier kündigen" })).toBeVisible();
  await expect(page.getByText(`${contractNumber} (Andante)`)).toBeVisible();
  await expect(page.getByLabel("Name")).toHaveValue("Mira Mertens");
  await expect(page.getByLabel("E-Mail-Adresse für die Bestätigung")).toHaveValue(me.email);
  await expect(page.getByRole("radio", { name: /Ordentlich kündigen/ })).toBeChecked();
  await expectAccessible(page, "/mitgliedschaft/kuendigen");

  // Außerordentlich ohne Grund: Hinweis am Feld
  await page.getByRole("radio", { name: /Außerordentlich kündigen/ }).check();
  await page.getByRole("button", { name: "Jetzt kündigen", exact: true }).click();
  await expect(page.getByText("Bitte nennen Sie bei einer außerordentlichen Kündigung den Grund.")).toBeVisible();
  await page.getByRole("radio", { name: /Ordentlich kündigen/ }).check();
  await page.getByRole("textbox", { name: /Grund/ }).fill("Ich ziehe um.");
  await page.getByRole("button", { name: "Jetzt kündigen", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Ihre Kündigung ist eingegangen" })).toBeFocused();
  await expect(page.getByText(RECEIPT)).toBeVisible();
  await expect(page.getByText(`Die Bestätigung haben wir an ${me.email} geschickt.`)).toBeVisible();
  await expectAccessible(page, "Kündigung eingegangen");
  const [m] = await sql`select status, cancel_at from billing.memberships where user_id = ${me.id}::uuid`;
  expect(m!.status).toBe("cancelled");
  const [a] = await sql`select details from billing.contract_actions where user_id = ${me.id}::uuid and kind = 'cancel'`;
  expect(a!.details).toMatchObject({ kind: "ordentlich", reason: "Ich ziehe um.", channel: "angemeldet", name: "Mira Mertens" });
  const mail = await waitForOutbox(me.email, "billing.cancel_confirmation");
  expect(mail.subject).toContain(contractNumber);

  await page.goto("/mitgliedschaft");
  await expect(page.locator("#stand").getByText("gekündigt", { exact: true })).toBeVisible();
  await expect(page.locator("#verlauf").getByText("Kündigung")).toBeVisible();
  // Zweites Mal: nichts mehr zu kündigen
  await page.goto("/mitgliedschaft/kuendigen");
  await expect(page.getByText("Ihre Mitgliedschaft ist bereits gekündigt.")).toBeVisible();
  c.expectClean();
});

test("Kündigungsknopf ohne Anmeldung: Fuß-Link, Formular, Bestätigungslink aus der Mail", async ({ page, context }) => {
  const c = watchConsole(page);
  const me = await onboardedMember({ first: "Lea" });
  const { contractNumber } = await activeMembership(me.id, "auftakt");

  await page.goto("/anmelden");
  await page.getByRole("contentinfo").getByRole("link", { name: "Verträge hier kündigen" }).click();
  await expect(page).toHaveURL(/\/kuendigen$/);
  await expect(page.getByRole("heading", { level: 1, name: "Verträge hier kündigen" })).toBeVisible();
  await expectAccessible(page, "/kuendigen");

  // Pflichtfelder
  await page.getByRole("button", { name: "Jetzt kündigen", exact: true }).click();
  await expect(page.getByLabel("Vor- und Nachname")).toBeFocused();
  await expectAccessible(page, "/kuendigen mit Fehlern");

  const before = new Date(Date.now() - 1000);
  await page.getByLabel("Vor- und Nachname").fill("Lea Mertens");
  await page.getByLabel("E-Mail-Adresse Ihres Fermata-Kontos").fill(me.email);
  await page.getByLabel("Vertragsnummer").fill(contractNumber.toLowerCase());
  await page.getByRole("button", { name: "Jetzt kündigen", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Danke. Ihre Kündigung ist abgeschickt." })).toBeVisible();
  await expect(page.getByText(/Abgeschickt am \d{2}\.\d{2}\.\d{4} um \d{2}:\d{2}:\d{2} Uhr\./)).toBeVisible();
  await expectAccessible(page, "/kuendigen abgeschickt");

  // Link aus der Mail (lokal in ops.mail_outbox): Bestätigungsseite der Edge Function, erst der Knopf führt aus
  const mail = await waitForOutbox(me.email, "billing.cancel_link", before);
  const link = linkFromMail(mail.text, "billing-cancel?t=");
  const confirmPage = await context.newPage();
  await confirmPage.goto(link);
  await expect(confirmPage.getByRole("heading", { name: "Kündigung bestätigen" })).toBeVisible();
  let [m] = await sql`select status from billing.memberships where user_id = ${me.id}::uuid`;
  expect(m!.status).toBe("active");
  await confirmPage.getByRole("button", { name: "Kündigung bestätigen" }).click();
  await expect(confirmPage.getByRole("heading", { name: "Ihre Kündigung ist eingegangen" })).toBeVisible();
  [m] = await sql`select status from billing.memberships where user_id = ${me.id}::uuid`;
  expect(m!.status).toBe("cancelled");
  const [a] = await sql`select details from billing.contract_actions where user_id = ${me.id}::uuid and kind = 'cancel'`;
  expect(a!.details.channel).toBe("ohne_anmeldung");
  await waitForOutbox(me.email, "billing.cancel_confirmation");

  // Falsche Angaben: dieselbe Antwort, keine Mail
  await page.getByRole("button", { name: "Formular noch einmal ausfüllen" }).click();
  await page.getByLabel("Vor- und Nachname").fill("Jemand");
  await page.getByLabel("E-Mail-Adresse Ihres Fermata-Kontos").fill("niemand@e2e.fermata.test");
  await page.getByLabel("Vertragsnummer").fill("FM-AAAA-BBBB");
  await page.getByRole("button", { name: "Jetzt kündigen", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Danke. Ihre Kündigung ist abgeschickt." })).toBeVisible();
  const [n] = await sql`select count(*)::int as n from ops.mail_outbox where recipient = 'niemand@e2e.fermata.test'`;
  expect(n!.n).toBe(0);

  // Angemeldet führt /kuendigen zur vorausgefüllten Fassung
  await loginByLink(page, me.email);
  await page.goto("/kuendigen");
  await expect(page).toHaveURL(/\/mitgliedschaft\/kuendigen$/);
  c.expectClean();
});

test("Widerrufsbutton angemeldet: Berechnung sichtbar, „Widerruf bestätigen“, Eingangsbestätigung", async ({ page }) => {
  const c = watchConsole(page);
  const me = await onboardedMember({ first: "Nora" });
  const { contractNumber } = await activeMembership(me.id, "andante");
  await loginByLink(page, me.email);
  await page.goto("/mitgliedschaft");
  await page.locator("#widerrufen").getByRole("link", { name: "Vertrag widerrufen" }).click();
  await expect(page).toHaveURL(/\/mitgliedschaft\/widerrufen$/);
  await expect(page.getByRole("heading", { level: 1, name: "Vertrag widerrufen" })).toBeVisible();
  await expect(page.getByLabel("Vertragsnummer")).toHaveValue(contractNumber);
  await expect(page.getByLabel("Name")).toHaveValue("Nora Mertens");
  const money = page.locator(".money");
  await expect(money.getByText("Bezahlt")).toBeVisible();
  await expect(money.getByText("149,00 €").first()).toBeVisible();
  await expectAccessible(page, "/mitgliedschaft/widerrufen");

  // Falsche Vertragsnummer: Hinweis am Feld
  await page.getByLabel("Vertragsnummer").fill("FM-XXXX-YYYY");
  await page.getByRole("button", { name: "Widerruf bestätigen", exact: true }).click();
  await expect(page.getByText("Die Vertragsnummer passt nicht zu Ihrem Konto.", { exact: false })).toBeVisible();
  await page.getByLabel("Vertragsnummer").fill(contractNumber);
  await page.getByRole("button", { name: "Widerruf bestätigen", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Ihr Widerruf ist eingegangen" })).toBeFocused();
  await expect(page.getByText(RECEIPT)).toBeVisible();
  await expectAccessible(page, "Widerruf eingegangen");
  const [m] = await sql`select status from billing.memberships where user_id = ${me.id}::uuid`;
  expect(m!.status).toBe("withdrawn");
  await waitForOutbox(me.email, "billing.withdraw_receipt");
  await page.goto("/mitgliedschaft");
  await expect(page.locator("#stand").getByText("widerrufen", { exact: true })).toBeVisible();
  await expect(page.locator("#verlauf").getByText("Widerruf")).toBeVisible();
  c.expectClean();
});

test("Widerrufsbutton ohne Anmeldung: Formular und Bestätigungslink", async ({ page, context }) => {
  const me = await onboardedMember({ first: "Ida" });
  const { contractNumber } = await activeMembership(me.id, "auftakt");
  await page.goto("/widerrufen");
  await expect(page.getByRole("heading", { level: 1, name: "Vertrag widerrufen" })).toBeVisible();
  await expectAccessible(page, "/widerrufen");
  const before = new Date(Date.now() - 1000);
  await page.getByLabel("Vor- und Nachname").fill("Ida Mertens");
  await page.getByLabel("E-Mail-Adresse Ihres Fermata-Kontos").fill(me.email);
  await page.getByLabel("Vertragsnummer").fill(contractNumber);
  await page.getByRole("button", { name: "Widerruf bestätigen", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Danke. Ihr Widerruf ist abgeschickt." })).toBeVisible();
  const mail = await waitForOutbox(me.email, "billing.withdraw_link", before);
  const confirmPage = await context.newPage();
  await confirmPage.goto(linkFromMail(mail.text, "billing-withdraw?t="));
  await confirmPage.getByRole("button", { name: "Widerruf bestätigen" }).click();
  await expect(confirmPage.getByRole("heading", { name: "Ihr Widerruf ist eingegangen" })).toBeVisible();
  const [m] = await sql`select status from billing.memberships where user_id = ${me.id}::uuid`;
  expect(m!.status).toBe("withdrawn");
});
