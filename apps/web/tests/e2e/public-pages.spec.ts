// Öffentliche Seiten ohne Anmeldung: Rechtstexte mit ENTWURF-Hinweis, Fußlinks (Kündigen, Widerrufen,
// Widerrufsbelehrung), Bestätigung durch das Lokal (/lokal/bestaetigen#t=…), „Abend teilen“ ohne gültigen Link.
import { expect, test } from "@playwright/test";
import { sql } from "./helpers/backend";
import { expectAccessible, watchConsole } from "./helpers/checks";
import { stack } from "./helpers/env";
import { onboardedMember } from "./helpers/member";
import { confirmedEvening, venueToken } from "./helpers/ui-b";

test("Rechtstexte: ENTWURF deutlich sichtbar, Widerrufsbelehrung und Verträge im Fuß und in der Übersicht", async ({ page }) => {
  const c = watchConsole(page);
  await page.goto("/rechtliches/agb");
  await expect(page.getByRole("heading", { level: 1, name: "Nutzungsbedingungen" })).toBeVisible();
  await expect(page.getByText("ENTWURF – noch nicht rechtsverbindlich")).toBeVisible();
  await expect(page.getByText("Entwurf – der verbindliche Text folgt nach rechtlicher Prüfung.")).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Wer teilnehmen kann" })).toBeVisible();
  await expectAccessible(page, "/rechtliches/agb");

  // Widerrufsbelehrung: Text aus api.legal_document('widerruf') oder Hinweis, dass er folgt – immer mit ENTWURF
  await page.getByRole("contentinfo").getByRole("link", { name: "Widerrufsbelehrung" }).click();
  await expect(page).toHaveURL(/\/rechtliches\/widerruf$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Widerruf");
  await expect(page.getByText("ENTWURF – noch nicht rechtsverbindlich")).toBeVisible();
  await expectAccessible(page, "/rechtliches/widerruf");

  await page.goto("/rechtliches");
  await expect(page.getByRole("link", { name: "Widerrufsbelehrung" }).first()).toBeVisible();
  const contracts = page.getByRole("region", { name: "Verträge" });
  await expect(contracts.getByRole("link", { name: "Verträge hier kündigen" })).toHaveAttribute("href", "/kuendigen");
  await expect(contracts.getByRole("link", { name: "Vertrag widerrufen" })).toHaveAttribute("href", "/widerrufen");
  await expectAccessible(page, "/rechtliches");
  const footer = page.getByRole("contentinfo");
  await expect(footer.getByRole("link", { name: "Verträge hier kündigen" })).toHaveAttribute("href", "/kuendigen");
  await expect(footer.getByRole("link", { name: "Vertrag widerrufen" })).toHaveAttribute("href", "/widerrufen");
  expect((await page.goto("/rechtliches/gibtsnicht"))!.status()).toBe(404);
  c.expectClean();
});

test("Lokal bestätigt die Reservierung über den Link (#t=…): erst der Knopf bestätigt", async ({ page }) => {
  const c = watchConsole(page);
  const a = await onboardedMember({ first: "Mira" });
  const b = await onboardedMember({ first: "Jonas" });
  const e = await confirmedEvening(a.id, b.id, { venueName: "Weinstube am See" });
  const token = venueToken(e.reservationId);

  // Liefert die Function schon JSON (Vertrag mit der Härtung), zeigt die Seite alle Angaben.
  const probe = await fetch(`${stack.SUPABASE_URL}/functions/v1/venue-confirm?t=${encodeURIComponent(token)}`, { headers: { accept: "application/json" } });
  const json = (probe.headers.get("content-type") ?? "").includes("application/json");

  await page.goto(`/lokal/bestaetigen#t=${token}`);
  await expect(page.getByRole("heading", { level: 1, name: "Reservierung bestätigen" })).toBeVisible();
  if (json) {
    await expect(page.getByText(e.tableCode)).toBeVisible();
    await expect(page.locator("main").getByText("Fermata", { exact: true })).toBeVisible();
    await expect(page.getByText("2 Personen")).toBeVisible();
  } else {
    await expect(page.getByText("Datum, Uhrzeit und Tisch-Code stehen in unserer E-Mail.")).toBeVisible();
  }
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expectAccessible(page, "/lokal/bestaetigen");
  // Bloßes Öffnen bestätigt nichts
  let [r] = await sql`select venue_confirmed_at from app.evening_reservations where id = ${e.reservationId}::uuid`;
  expect(r!.venue_confirmed_at).toBeNull();

  await page.getByRole("button", { name: "Reservierung bestätigen" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Danke. Die Reservierung ist bestätigt." })).toBeVisible();
  await expectAccessible(page, "/lokal/bestaetigen (bestätigt)");
  [r] = await sql`select venue_confirmed_at from app.evening_reservations where id = ${e.reservationId}::uuid`;
  expect(r!.venue_confirmed_at).not.toBeNull();

  // Ungültiger und fehlender Link
  await page.goto(`/lokal/bestaetigen#t=${token.slice(0, -4)}abcd`);
  await expect(page.getByRole("heading", { level: 1, name: "Dieser Link ist nicht gültig" })).toBeVisible();
  await page.goto("/lokal/bestaetigen");
  await expect(page.getByRole("heading", { name: "Kein Link" })).toBeVisible();
  await expectAccessible(page, "/lokal/bestaetigen (ohne Link)");
  c.expectClean();
});

test("Abend teilen ohne gültigen Link: ruhiger Hinweis mit 110", async ({ page }) => {
  const c = watchConsole(page);
  await page.goto("/teilen");
  await expect(page.getByRole("heading", { name: "Kein Link" })).toBeVisible();
  await page.goto("/teilen#t=abcdefghijklmnopqrstuvwxyz012345");
  await expect(page.getByRole("heading", { level: 1, name: "Dieser Link ist nicht mehr gültig" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Polizei-Notruf 110 anrufen" })).toHaveAttribute("href", "tel:110");
  await expectAccessible(page, "/teilen (ungültig)");
  // Strenge CSP auch hier: kein Stripe, keine Rahmen
  const res = await page.request.get("/teilen");
  const csp = res.headers()["content-security-policy"]!;
  expect(csp).not.toContain("stripe");
  expect(csp).toContain("frame-src 'none'");
  c.expectClean();
});
