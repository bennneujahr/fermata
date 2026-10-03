// Gespräch mit Viola als Text – echt gegen den lokalen Viola-Textdienst mit der Attrappe als Sprachmodell
// (stack.sh startet ihn). Einwilligung, KI-Hinweis, Antworten Satz für Satz, Ende, Zusammenfassung.
import { expect, test, type Page } from "@playwright/test";
import { sql } from "./helpers/backend";
import { expectAccessible, watchConsole } from "./helpers/checks";
import { member } from "./helpers/abende";
import { loginByLink } from "./helpers/member";

async function say(page: Page, text: string) {
  const before = await page.locator(".chat__item--viola").count();
  await page.getByLabel("Ihre Nachricht").fill(text);
  await page.keyboard.press("Enter");
  await expect(page.locator(".chat__item--person").last()).toContainText(text);
  await expect.poll(async () => page.locator(".chat__item--viola").count(), { timeout: 15_000 }).toBeGreaterThan(before);
  await expect(page.locator(".chat__item--typing")).toHaveCount(0);
}

async function grantConsent(page: Page) {
  await expect(page.getByRole("heading", { name: "Einwilligung zum Gespräch" })).toBeVisible();
  await page.getByLabel("Ich habe den Text gelesen und willige ein.").check();
  await page.getByRole("button", { name: "Zustimmen und weiter" }).click();
  await expect(page.getByRole("button", { name: "Lieber schreiben" })).toBeVisible();
}

test("Text: Einwilligung, KI-Hinweis zuerst, ganzes Gespräch, Zusammenfassung korrigieren (Art. 9) und bestätigen", async ({ page }) => {
  test.setTimeout(180_000);
  const console = watchConsole(page);
  const m = await member("Mira");
  await loginByLink(page, m.email);

  await page.goto("/gespraech");
  await expect(page.getByRole("heading", { level: 1, name: "Gespräch" })).toBeVisible();
  await expectAccessible(page, "/gespraech (Einwilligung)");
  await grantConsent(page);
  const [consent] = await sql`select count(*)::int as n from app.consents where user_id = ${m.id}::uuid and kind = 'gespraech' and action = 'granted'`;
  expect(consent!.n).toBe(1);
  await expectAccessible(page, "/gespraech (Wahl)");

  await page.getByRole("button", { name: "Lieber schreiben" }).click();
  // Der schriftliche KI-Hinweis steht vor allem anderen (Art. 50 AI Act).
  const notice = page.locator("#ki-hinweis");
  await expect(notice.getByRole("heading", { name: "Hinweis: Viola ist eine künstliche Intelligenz" })).toBeVisible();
  await expect(notice).toContainText("Sie schreiben gleich mit Viola. Viola ist eine künstliche Intelligenz, kein Mensch.");
  await expect(page.locator(".chat__item--viola").first()).toContainText("Ich bin Viola, eine künstliche Intelligenz von Fermata, kein Mensch.");
  await expectAccessible(page, "Textgespräch");

  await say(page, "Ja, gern.");
  for (let i = 1; i <= 30; i++) {
    if (await page.locator(".chat__summary").count()) break;
    await say(page, `Antwort ${i}: Ich wandere gern an der Ostsee und koche für Freunde.`);
  }
  await expect(page.locator(".chat__summary")).toContainText("Violas Zusammenfassung");
  await say(page, "Ja, das stimmt so.");

  await expect(page.getByRole("heading", { name: "Danke für das Gespräch" })).toBeVisible();
  await expectAccessible(page, "Gespräch beendet");
  await page.getByRole("link", { name: "Zur Zusammenfassung" }).click();
  await expect(page).toHaveURL(/\/gespraech\/[0-9a-f-]{36}$/);
  const sessionId = page.url().split("/").pop()!;
  await expect(page.getByRole("heading", { level: 1, name: "Zusammenfassung" })).toBeVisible();
  await expect(page.locator(".summary-draft")).toContainText("Sie haben mir", { timeout: 30_000 });
  await expectAccessible(page, "Zusammenfassung (Entwurf)");

  // Korrektur mit geschützter Angabe: ruhige Erklärung, nichts gespeichert
  await page.getByRole("button", { name: "Korrigieren" }).click();
  const field = page.getByLabel("Ihre Fassung");
  await expect(field).toBeFocused();
  await field.fill("Ich bin sehr gläubig und gehe jeden Sonntag in die Kirche. Ich wandere gern und koche für Freunde.");
  await page.getByRole("button", { name: "Korrektur speichern" }).click();
  await expect(page.getByText("Diese Angaben gehören nicht in die Zusammenfassung")).toBeVisible();
  await expect(page.getByText(/Ihr Text enthält Angaben zu Religion oder Weltanschauung/)).toBeVisible();
  await expectAccessible(page, "Zusammenfassung (Art.-9-Hinweis)");
  let [s] = await sql`select summary_status from app.interview_sessions where id = ${sessionId}::uuid`;
  expect(s!.summary_status).toBe("draft");

  await field.fill("Ich wandere gern an der Ostsee, koche für Freunde und mag ruhige Abende mit gutem Gespräch.");
  await page.getByRole("button", { name: "Korrektur speichern" }).click();
  await expect(page.getByText("Danke. Ihre Korrektur ist gespeichert.")).toBeVisible();
  [s] = await sql`select summary_status from app.interview_sessions where id = ${sessionId}::uuid`;
  expect(s!.summary_status).toBe("corrected");
  const [pc] = await sql`select summary_text, summary_confirmed_at from app.profile_core where user_id = ${m.id}::uuid`;
  expect(pc!.summary_text).toContain("Ostsee");
  expect(pc!.summary_confirmed_at).not.toBeNull();

  // Transkript: KI-Hinweis zuerst, Löschung nach 30 Tagen
  const [tr] = await sql`select turns -> 0 ->> 'text' as first, delete_at::date - created_at::date as days from app.interview_transcripts where session_id = ${sessionId}::uuid`;
  expect(tr!.first).toContain("künstliche Intelligenz");
  expect(tr!.days).toBe(30);

  // Verlauf und bestätigte Zusammenfassung auf /gespraech
  await page.goto("/gespraech");
  await expect(page.locator("#zusammenfassung")).toContainText("Ostsee");
  const history = page.locator("#verlauf");
  await expect(history).toContainText("Erstes Gespräch");
  await expect(history).toContainText("abgeschlossen");
  await expect(history).toContainText("Zusammenfassung korrigiert");
  await expect(history).toContainText(/Gesprächstext bis .* lesbar/);
  await expectAccessible(page, "/gespraech (Verlauf)");

  // Gesprächstext ansehen
  await history.getByRole("link", { name: "Ansehen" }).first().click();
  await page.getByText("Gesprächstext", { exact: true }).click();
  await expect(page.locator(".transcript__turn").first()).toContainText("künstliche Intelligenz");
  await expectAccessible(page, "Gesprächstext");
  console.expectClean();
});

test("Text: früh beenden (Du-Form) ohne Zusammenfassung; Krise zeigt die Hilfe dauerhaft", async ({ page }) => {
  test.setTimeout(120_000);
  const console = watchConsole(page);
  const m = await member("Jonas");
  await sql`update app.accounts set address_form = 'du' where user_id = ${m.id}::uuid`;
  await loginByLink(page, m.email);
  await page.goto("/gespraech");
  await grantConsent(page);
  await page.getByRole("button", { name: "Lieber schreiben" }).click();
  await expect(page.locator("#ki-hinweis")).toContainText("Du schreibst gleich mit Viola.");
  await expect(page.locator(".chat__item--viola").first()).toContainText("Ich bin Viola");
  const say2 = async (t: string) => {
    const before = await page.locator(".chat__item--viola").count();
    await page.getByLabel("Deine Nachricht").fill(t);
    await page.getByRole("button", { name: "Senden" }).click();
    await expect.poll(async () => page.locator(".chat__item--viola").count(), { timeout: 15_000 }).toBeGreaterThan(before);
  };
  await say2("Ja, gern.");
  await say2("Ich bin eher ruhig.");

  await page.getByRole("button", { name: "Beenden" }).click();
  const dialog = page.getByRole("dialog", { name: "Gespräch beenden?" });
  await expect(dialog).toBeVisible();
  await expectAccessible(page, "Dialog Beenden");
  await dialog.getByRole("button", { name: "Ja, beenden" }).click();
  await expect(page.getByRole("heading", { name: "Danke für das Gespräch" })).toBeVisible();
  await page.getByRole("link", { name: "Zur Zusammenfassung" }).click();
  await expect(page.getByText(/Für dieses Gespräch gibt es keine Zusammenfassung/)).toBeVisible({ timeout: 30_000 });
  await expectAccessible(page, "Zusammenfassung (keine)");

  // Neues Gespräch: Krise → Hilfe dauerhaft sichtbar
  await page.goto("/gespraech");
  await page.getByRole("button", { name: "Lieber schreiben" }).click();
  await expect(page.locator(".chat__item--viola").first()).toContainText("Ich bin Viola");
  await page.getByLabel("Deine Nachricht").fill("Ich will nicht mehr leben und denke daran, mir das Leben zu nehmen.");
  await page.getByRole("button", { name: "Senden" }).click();
  const crisis = page.getByRole("region", { name: /Hilfe in schweren Momenten/ });
  await expect(crisis).toBeVisible({ timeout: 15_000 });
  await expect(crisis.getByRole("link", { name: /0800 1110111 anrufen/ })).toHaveAttribute("href", "tel:08001110111");
  await expect(crisis.getByRole("link", { name: /Notruf 112/ })).toHaveAttribute("href", "tel:112");
  await expectAccessible(page, "Krise");
  console.expectClean();
});
