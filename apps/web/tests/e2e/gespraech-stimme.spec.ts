// Gespräch mit Stimme: Oberfläche mit der Attrappe des LiveKit-Raums (VIOLA_VOICE_MODE=fake im Stapel).
// Echt sind: interview-token (Sitzung, LiveKit-Token, KI-Hinweis), Wechsel zu Text gegen den Textdienst.
// Das Mikrofon wird im Browser ersetzt (getUserMedia), damit der Test ohne Gerät läuft.
// Nicht abgedeckt (echtes Gerät nötig): LiveKit-Verbindung, Ton, Spracherkennung, Untertitel aus Text-Streams.
import { expect, test, type Page } from "@playwright/test";
import { sql } from "./helpers/backend";
import { expectAccessible, watchConsole } from "./helpers/checks";
import { member } from "./helpers/abende";
import { loginByLink } from "./helpers/member";

async function memberWithConsent(first: string) {
  const m = await member(first);
  await sql.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: m.id, role: "authenticated" })}, true)`;
    await tx`set local role authenticated`;
    await tx`select api.give_consent('gespraech', (select d.version from api.legal_document('gespraech') d))`;
  });
  return m;
}

/** Mikrofon im Browser ersetzen: erlaubt (stiller Ton) oder verweigert. */
async function fakeMicrophone(page: Page, mode: "allow" | "deny") {
  await page.addInitScript((m) => {
    const md = navigator.mediaDevices;
    if (!md) return;
    md.getUserMedia = async () => {
      if (m === "deny") throw new DOMException("Permission denied", "NotAllowedError");
      const ctx = new AudioContext();
      return ctx.createMediaStreamDestination().stream;
    };
  }, mode);
}

const atem = (page: Page) => page.locator(".voice fermata-atem");
const fake = (page: Page, js: string) => page.evaluate(js);

test("Stimme: Mikrofon, KI-Hinweis, Atem folgt dem Agenten, Pause, Untertitel, Hilfe, Text statt Stimme", async ({ page }) => {
  const console = watchConsole(page);
  const m = await memberWithConsent("Mira");
  await fakeMicrophone(page, "allow");
  await loginByLink(page, m.email);
  await page.goto("/gespraech");
  await expect(page.getByRole("button", { name: "Sprechen" })).toBeEnabled();
  await page.getByRole("button", { name: "Sprechen" }).click();

  // Schriftlicher KI-Hinweis aus interview-token, bevor Viola spricht
  await expect(page.locator("#ki-hinweis")).toContainText("Sie sprechen gleich mit Viola. Viola ist eine künstliche Intelligenz, kein Mensch. Ihre Stimme wird nicht aufgezeichnet.");
  const [s] = await sql`select id, mode, status from app.interview_sessions where user_id = ${m.id}::uuid order by created_at desc limit 1`;
  expect(s).toMatchObject({ mode: "voice", status: "requested" });

  // Attrappe: Viola spricht den KI-Hinweis, dann hört sie zu
  await expect(atem(page)).toHaveAttribute("state", "spricht");
  await expect(page.locator(".voice__captions")).toContainText("Ich bin Viola, eine künstliche Intelligenz");
  await expect(atem(page)).toHaveAttribute("state", "hoert");
  await expect(page.locator(".voice__state")).toHaveText("Viola hört zu.");
  await expectAccessible(page, "Sprachgespräch");

  await fake(page, "window.__violaFake.state('thinking')");
  await expect(atem(page)).toHaveAttribute("state", "denkt");
  await fake(page, "window.__violaFake.state('speaking')");
  await expect(atem(page)).toHaveAttribute("state", "spricht");
  await fake(page, "window.__violaFake.caption('viola', 'Was ist Ihnen an einem Abend wichtig?')");
  await expect(page.locator(".voice__captions")).toContainText("Was ist Ihnen an einem Abend wichtig?");

  // Pause: Mikrofon stumm, Atem pausiert
  await page.getByRole("button", { name: "Pause" }).click();
  await expect(atem(page)).toHaveAttribute("state", "pause");
  await expect(page.getByText("Viola hört nichts, bis Sie weitermachen.")).toBeVisible();
  expect(await fake(page, "window.__violaFake.mic")).toBe(false);
  await page.getByRole("button", { name: "Weiter" }).click();
  expect(await fake(page, "window.__violaFake.mic")).toBe(true);
  await expect(atem(page)).toHaveAttribute("state", "spricht");

  // Untertitel ausblenden und wieder zeigen
  await page.getByRole("button", { name: "Untertitel ausblenden" }).click();
  await expect(page.locator(".voice__captions")).toHaveCount(0);
  await page.getByRole("button", { name: "Untertitel zeigen" }).click();
  await expect(page.locator(".voice__captions")).toBeVisible();

  // Zusammenfassung zum Mitlesen, Krisen-Hilfe dauerhaft sichtbar
  await fake(page, "window.__violaFake.packet({type: 'summary_proposed', text: 'Sie wandern gern und mögen ruhige Abende.', partial: false})");
  await expect(page.locator(".voice__summary")).toContainText("Sie wandern gern und mögen ruhige Abende.");
  await fake(page, "window.__violaFake.packet({type: 'crisis_resources', lines: {telefonseelsorge: ['0800 1110111', '0800 1110222', '116 123'], notruf: '112'}})");
  const crisis = page.getByRole("region", { name: /Hilfe in schweren Momenten/ });
  await expect(crisis.getByRole("link", { name: /116 123 anrufen/ })).toHaveAttribute("href", "tel:116123");
  await expectAccessible(page, "Sprachgespräch mit Hilfe");

  // Text statt Stimme: Datenpaket an den Agenten, gleiche Sitzung im Textmodus
  const sent = await page.evaluateHandle("window.__violaFake");
  await page.getByRole("button", { name: "Text statt Stimme" }).click();
  expect(await sent.evaluate((f: { sent: unknown[] }) => f.sent)).toContainEqual({ type: "switch_to_text" });
  await expect(page.getByText("Sie schreiben jetzt weiter. Viola kennt den bisherigen Verlauf.")).toBeVisible();
  await expect(page.locator(".chat__item--viola").first()).toContainText("Ich bin Viola", { timeout: 15_000 });
  await expect(crisis).toBeVisible();
  const [after] = await sql`select count(*)::int as n, max(mode) as mode from app.interview_sessions where user_id = ${m.id}::uuid and status in ('requested', 'active')`;
  expect(after).toMatchObject({ n: 1 });
  await expectAccessible(page, "Nach dem Wechsel zu Text");
  console.expectClean();
});

test("Stimme: Ende durch Viola führt zur Zusammenfassung; abgebrochene Verbindung bietet Text an", async ({ page }) => {
  const console = watchConsole(page);
  const m = await memberWithConsent("Lea");
  await fakeMicrophone(page, "allow");
  await loginByLink(page, m.email);
  await page.goto("/gespraech");
  await page.getByRole("button", { name: "Sprechen" }).click();
  await expect(atem(page)).toHaveAttribute("state", "hoert");
  await fake(page, "window.__violaFake.packet({type: 'ended', reason: 'fertig', summary_pending: true})");
  await expect(page.getByRole("heading", { name: "Danke für das Gespräch" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Zur Zusammenfassung" })).toHaveAttribute("href", /\/gespraech\/[0-9a-f-]{36}$/);
  await expectAccessible(page, "Ende nach Stimme");

  // Neues Gespräch, Verbindung bricht ab
  await page.getByRole("button", { name: "Zurück zum Gespräch" }).click();
  await page.getByRole("button", { name: "Sprechen" }).click();
  await expect(atem(page)).toHaveAttribute("state", "hoert");
  await fake(page, "window.__violaFake.drop()");
  await expect(page.getByText("Die Verbindung ist abgebrochen")).toBeVisible();
  await expect(page.getByRole("button", { name: "Als Text weitermachen" })).toBeVisible();
  await expectAccessible(page, "Verbindung abgebrochen");
  await page.getByRole("button", { name: "Als Text weitermachen" }).click();
  await expect(page.locator(".chat__item--viola").first()).toContainText("Ich bin Viola", { timeout: 15_000 });
  console.expectClean();
});

test("Stimme: Mikrofon verweigert – klare Erklärung und Schreiben als Ausweg", async ({ page }) => {
  const console = watchConsole(page);
  const m = await memberWithConsent("Ben");
  await fakeMicrophone(page, "deny");
  await loginByLink(page, m.email);
  await page.goto("/gespraech");
  await page.getByRole("button", { name: "Sprechen" }).click();
  await expect(page.getByText(/Der Browser hat das Mikrofon nicht freigegeben/)).toBeVisible();
  // Keine Sitzung ohne Mikrofon
  const [n] = await sql`select count(*)::int as n from app.interview_sessions where user_id = ${m.id}::uuid`;
  expect(n!.n).toBe(0);
  await expectAccessible(page, "Mikrofon verweigert");
  await page.locator(".notice").getByRole("button", { name: "Lieber schreiben" }).click();
  await expect(page.locator("#ki-hinweis")).toContainText("Sie schreiben gleich mit Viola.");
  await expect(page.locator(".chat__item--viola").first()).toContainText("Ich bin Viola", { timeout: 15_000 });
  console.expectClean();
});
