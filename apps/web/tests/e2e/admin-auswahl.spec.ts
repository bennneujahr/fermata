// Admin „Auswahl“: Lauf prüfen, ablehnen (mit Kommentar), freigeben (Abend entsteht), Sammelfreigabe nur ohne Warnung,
// Tastatur, Bericht (Verteilung, Fairness k-anonym), Lauf abschließen.
import { expect, test } from "@playwright/test";
import { adminSession, closeOpenRuns, simulateRun, type AdminSession } from "./helpers/admin";
import { sql } from "./helpers/backend";
import { expectAccessible, watchConsole } from "./helpers/checks";

test.describe.configure({ mode: "serial" });

let admin: AdminSession;
let runId: string;

test.beforeAll(async ({ browser }) => {
  test.setTimeout(300_000);
  runId = await simulateRun(120, 42);
  await closeOpenRuns(runId);
  admin = await adminSession(browser);
});

test("Lauf prüfen: ablehnen, freigeben, Sammelfreigabe, abschließen", async ({ browser }) => {
  test.setTimeout(180_000);
  const ctx = await browser.newContext({ storageState: admin.state });
  const page = await ctx.newPage();
  const console = watchConsole(page);

  // Von „Heute“ in den Lauf
  await page.goto("/admin");
  await page.getByRole("region", { name: "Auswahl-Läufe in Prüfung" }).getByRole("link").first().click();
  await expect(page).toHaveURL(new RegExp(`/admin/auswahl/${runId}`));
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Lauf für");
  await expectAccessible(page, "/admin/auswahl/[id]");
  const total = Number((await sql`select count(*)::int as n from app.pairings where run_id = ${runId}::uuid`)[0]!.n);
  expect(total).toBeGreaterThan(5);
  const cards = page.locator("article.pairing");
  await expect(cards).toHaveCount(total);

  // Personen nur mit Anzeigename und Altersband; keine Nachnamen, keine E-Mails
  const first = cards.first();
  await expect(first.getByRole("heading", { level: 3 })).toContainText(/Jahre/);
  expect(await page.locator("main").textContent()).not.toContain("@sim.fermata.test");

  // Tastatur: j springt zum nächsten Vorschlag
  await first.focus();
  await page.keyboard.press("j");
  await expect(cards.nth(1)).toBeFocused();
  await page.keyboard.press("k");
  await expect(cards.first()).toBeFocused();

  // Warnung hervorgehoben: Filter „Mit Warnung“
  const warned = Number((await sql`select count(*)::int as n from app.pairings where run_id = ${runId}::uuid
      and (jsonb_array_length(coalesce(review_notes -> 'hinweise', '[]')) > 0 or review_notes ->> 'empfehlung' <> 'freigeben'
           or (review_notes ->> 'ersatztext_verwendet')::boolean)`)[0]!.n);
  await page.getByRole("button", { name: "Mit Warnung", exact: true }).click();
  await expect(page.locator("article.pairing.pairing--warning")).toHaveCount(warned);
  await page.getByRole("button", { name: "Offen", exact: true }).click();

  // Ablehnen ohne Kommentar: Hinweis; mit Kommentar: abgelehnt
  const rejectCard = cards.first();
  const rejectId = await rejectCard.getAttribute("data-pairing");
  await rejectCard.getByRole("button", { name: "Ablehnen" }).click();
  await expect(rejectCard.getByText("Bitte beim Ablehnen kurz begründen")).toBeVisible();
  await rejectCard.getByLabel("Kommentar").fill("Wohnorte zu weit auseinander");
  await rejectCard.getByRole("button", { name: "Ablehnen" }).click();
  await expect(page.locator(`article[data-pairing="${rejectId}"]`)).toHaveCount(0);
  const [rej] = await sql`select status, review_comment from app.pairings where id = ${rejectId}::uuid`;
  expect(rej).toMatchObject({ status: "rejected", review_comment: "Wohnorte zu weit auseinander" });

  // Freigeben: Abend mit Terminvorschlägen entsteht
  const approveCard = page.locator("article.pairing").first();
  const approveId = await approveCard.getAttribute("data-pairing");
  await approveCard.getByRole("button", { name: "Freigeben" }).click();
  await expect(page.locator(`article[data-pairing="${approveId}"]`)).toHaveCount(0);
  const [ev] = await sql`select e.state, jsonb_array_length(e.proposed_times) as n, p.status from app.evenings e join app.pairings p on p.id = e.pairing_id where p.id = ${approveId}::uuid`;
  expect(ev).toMatchObject({ state: "proposed", status: "proposed" });
  expect(Number(ev!.n)).toBeGreaterThan(0);

  // Sammelfreigabe: nur ohne Warnung, mit Rückfrage
  const eligible = Number((await sql`select count(*)::int as n from app.pairings where run_id = ${runId}::uuid and status = 'pending_review'
      and jsonb_array_length(coalesce(review_notes -> 'hinweise', '[]')) = 0 and coalesce(review_notes ->> 'empfehlung', 'freigeben') = 'freigeben'
      and not coalesce((review_notes ->> 'ersatztext_verwendet')::boolean, false) and coalesce((review_notes -> 'art9_filter' ->> 'ok')::boolean, true)`)[0]!.n);
  await page.getByRole("button", { name: `Alle ohne Warnung auswählen (${eligible})` }).click();
  await page.getByRole("button", { name: eligible === 1 ? "1 Vorschlag freigeben" : `${eligible} Vorschläge freigeben` }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expectAccessible(page, "Sammelfreigabe Dialog");
  await dialog.getByRole("button", { name: "Jetzt freigeben" }).click();
  await expect(page.getByText(new RegExp(`^${eligible} freigegeben`))).toBeVisible({ timeout: 60_000 });
  const [left] = await sql`select count(*)::int as n from app.pairings where run_id = ${runId}::uuid and status = 'pending_review'`;
  expect(left!.n).toBe(total - 2 - eligible);

  // Bericht: Verteilung als Diagramm mit Tabelle, Fairness ohne kleine Gruppen
  await expect(page.getByRole("heading", { level: 2, name: "Bericht" })).toBeVisible();
  await expect(page.getByRole("img", { name: /Histogramm der Qualität/ })).toBeVisible();
  await expect(page.getByRole("table", { name: "Nach Geschlecht" })).toBeVisible();
  for (const v of await page.getByRole("table", { name: "Nach Geschlecht" }).locator("tbody tr td:nth-child(2)").allTextContents()) {
    expect(Number(v.replace(/\D/g, ""))).toBeGreaterThanOrEqual(5);
  }

  // Abschließen: mit offenen Vorschlägen nur mit Häkchen
  const finish = page.getByRole("region", { name: "Lauf abschließen" });
  if (Number(left!.n) > 0) {
    await finish.getByRole("button", { name: "Lauf abschließen" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Abschließen" }).click();
    await expect(finish.getByText(/Noch \d+ Vorschläge? offen/)).toBeVisible();
    await finish.getByLabel("Offene Vorschläge beim Abschluss ablehnen").check();
  }
  await finish.getByRole("button", { name: "Lauf abschließen" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Abschließen" }).click();
  await expect(page.getByText("Dieser Lauf ist nicht in Prüfung.")).toBeVisible();
  const [run] = await sql`select status, report -> 'freigabe' as f from app.match_runs where id = ${runId}::uuid`;
  expect(run!.status).toBe("partially_approved");
  expect(run!.f).toBeTruthy();
  const [audit] = await sql`select count(*)::int as n from ops.audit_log where action in ('matching.pairing_approved', 'matching.pairing_rejected', 'matching.run_finished') and actor = ${admin.id}::uuid`;
  expect(audit!.n).toBeGreaterThanOrEqual(eligible + 3);
  await expectAccessible(page, "/admin/auswahl/[id] abgeschlossen");
  console.expectClean();

  // Liste der Läufe
  await page.getByRole("navigation", { name: "Admin-Navigation" }).getByRole("link", { name: "Auswahl" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Auswahl" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "teilweise freigegeben" }).first()).toBeVisible();
  await expectAccessible(page, "/admin/auswahl");
  await ctx.close();
});
