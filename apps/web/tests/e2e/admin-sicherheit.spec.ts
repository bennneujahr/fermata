// Admin „Sicherheit“: Meldungen nach Frist, Einzelansicht, in Prüfung nehmen, Sanktion verhängen und aufheben,
// Meldung abschließen, Widerspruch entscheiden, Hinweis erledigen, Polizeivorlage, Transkript nur im Sicherheitsfall.
import { expect, test } from "@playwright/test";
import { adminSession, type AdminSession } from "./helpers/admin";
import { agentFlagWithTranscript, confirmedEvening, fileAppeal, fileReport, fixtureVenue, memberPair } from "./helpers/admin-fixtures";
import { sql } from "./helpers/backend";
import { expectAccessible, watchConsole } from "./helpers/checks";

test.describe.configure({ mode: "serial" });

let admin: AdminSession;

test.beforeAll(async ({ browser }) => {
  admin = await adminSession(browser);
});

test("Meldung prüfen: Frist, Sanktion verhängen und aufheben, abschließen, Polizeivorlage", async ({ browser }) => {
  test.setTimeout(120_000);
  const venue = await fixtureVenue();
  const { a, b } = await memberPair("Mona", "Nils");
  const evening = await confirmedEvening(a.id, b.id, venue, "-28 hours");
  const reportId = await fileReport(a.id, b.id, evening, "belaestigung", "abend", "Er hat mich nach dem Abend mehrfach angerufen, obwohl ich nein gesagt habe.");
  await sql`update safety.reports set due_at = now() - interval '1 hour' where id = ${reportId}::uuid`;

  const ctx = await browser.newContext({ storageState: admin.state });
  const page = await ctx.newPage();
  const console = watchConsole(page);
  await page.goto("/admin/sicherheit");
  await expect(page.getByRole("heading", { level: 1, name: "Sicherheit" })).toBeVisible();
  const row = page.locator("tr", { has: page.locator(`a[href="/admin/sicherheit/meldungen/${reportId}"]`) });
  await expect(row).toHaveClass(/row--alert/);
  await expect(row.getByText(/überfällig seit/)).toBeVisible();
  await expectAccessible(page, "/admin/sicherheit");

  await row.getByRole("link", { name: "Belästigung" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Meldung: Belästigung" })).toBeVisible();
  await expect(page.getByText("Er hat mich nach dem Abend mehrfach angerufen")).toBeVisible();
  await expect(page.getByText("Die gemeldete Person erfährt nie, wer gemeldet hat.")).toBeVisible();
  await expectAccessible(page, "/admin/sicherheit/meldungen/[id]");
  expect((await sql`select count(*)::int as n from ops.audit_log where action = 'safety.admin_view_report' and target_id = ${reportId}`)[0]!.n).toBeGreaterThan(0);

  // In Prüfung nehmen
  await page.getByRole("button", { name: "In Prüfung nehmen" }).click();
  await expect(page.getByRole("button", { name: "In Prüfung nehmen" })).toHaveCount(0);
  await expect(page.locator(".page-header").getByText("in Prüfung")).toBeVisible();
  expect((await sql`select status from safety.reports where id = ${reportId}::uuid`)[0]!.status).toBe("in_review");

  // Sanktion: befristete Sperre (Ende in 14 Tagen)
  const sanction = page.getByRole("region", { name: "Sanktion verhängen" });
  await expect(sanction.getByText(/Ausschluss: Das Konto bleibt gesperrt\. Name und Geburtsdatum kommen als Hash auf die Sperrliste/)).toBeVisible();
  await sanction.getByLabel("Art").selectOption("sperre");
  await sanction.getByLabel("Begründung (sieht die Person)").fill("Wiederholte Kontaktaufnahme gegen den Willen einer anderen Person.");
  const end = new Date(Date.now() + 14 * 86400000);
  const local = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}T18:00`;
  await sanction.getByLabel("Ende der Sperre").fill(local);
  await sanction.getByRole("button", { name: "Sanktion verhängen" }).click();
  await expect(page.getByRole("dialog", { name: "Sanktion verhängen?" })).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Verhängen" }).click();
  await expect(sanction.getByText(/^Verhängt\./)).toBeVisible();
  const [s] = await sql`select id, kind, ends_at from safety.sanctions where user_id = ${b.id}::uuid and kind = 'sperre' and lifted_at is null`;
  expect(s).toBeTruthy();
  expect((await sql`select status from app.accounts where user_id = ${b.id}::uuid`)[0]!.status).toBe("suspended");

  // Aufheben (aus der Vorgeschichte)
  const history = page.getByRole("region", { name: "Vorgeschichte der gemeldeten Person" });
  await history.getByLabel("Begründung").fill("Sperre war zu streng, Hinweis genügt.");
  await history.getByRole("button", { name: "Sanktion aufheben" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Aufheben" }).click();
  await expect.poll(async () => (await sql`select lifted_at from safety.sanctions where id = ${s!.id}::uuid`)[0]!.lifted_at).not.toBeNull();
  expect((await sql`select status from app.accounts where user_id = ${b.id}::uuid`)[0]!.status).not.toBe("suspended");

  // Polizeivorlage mit Erinnerung und Kopierknopf
  await page.getByRole("link", { name: "Vorlage öffnen" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Vorlage für eine Polizeimeldung" })).toBeVisible();
  await expect(page.getByText("Ob Anzeige erstattet wird, entscheidet Benn")).toBeVisible();
  await expect(page.locator("#polizeivorlage")).toContainText("ENTWURF – Sachverhaltsdarstellung für eine Strafanzeige");
  await expect(page.locator("#polizeivorlage")).toContainText("Nils Mertens");
  await expectAccessible(page, "/admin/sicherheit/meldungen/[id]/polizei");
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "Text kopieren" }).click();
  await expect(page.getByText("Kopiert.")).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("Sachverhaltsdarstellung");
  await page.getByRole("link", { name: "Zur Meldung" }).click();

  // Abschließen: ohne Begründung abgelehnt, dann erledigt
  await page.getByLabel(/^Erledigt/).check();
  await page.getByLabel("Begründung (intern)").fill("ok");
  await page.getByRole("button", { name: "Abschließen" }).click();
  await expect(page.getByText("Bitte eine Begründung angeben (mindestens 3 Zeichen).")).toBeVisible();
  await page.getByLabel("Begründung (intern)").fill("Hinweis an die Person, Kontaktsperre besprochen.");
  await page.getByRole("button", { name: "Abschließen" }).click();
  await expect(page.getByText("Diese Meldung ist abgeschlossen.")).toBeVisible();
  const [rep] = await sql`select status, resolution from safety.reports where id = ${reportId}::uuid`;
  expect(rep).toMatchObject({ status: "resolved", resolution: "Hinweis an die Person, Kontaktsperre besprochen." });
  console.expectClean();
  await ctx.close();
});

test("Widerspruch gegen eine vorläufige Sperre annehmen, Sanktionsliste", async ({ browser }) => {
  const venue = await fixtureVenue();
  const { a, b } = await memberPair("Olga", "Paul");
  const evening = await confirmedEvening(a.id, b.id, venue, "-27 hours");
  await fileReport(a.id, b.id, evening, "uebergriff", "abend", "Beim Abschied wurde ich gegen meinen Willen festgehalten.");
  const [prov] = await sql`select id from safety.sanctions where user_id = ${b.id}::uuid and kind = 'vorlaeufige_sperre' and lifted_at is null`;
  expect(prov).toBeTruthy();
  const appealId = await fileAppeal(b.id, prov!.id as string);

  const ctx = await browser.newContext({ storageState: admin.state });
  const page = await ctx.newPage();
  await page.goto("/admin/sicherheit/sanktionen");
  await expect(page.getByRole("heading", { level: 1, name: "Sanktionen" })).toBeVisible();
  await expect(page.locator("tr", { hasText: "Paul Mertens" }).first().locator(".badge", { hasText: "Vorläufige Sperre" })).toBeVisible();
  await expectAccessible(page, "/admin/sicherheit/sanktionen");

  await page.getByRole("navigation", { name: /Sicherheit: Bereich/ }).getByRole("link", { name: "Widersprüche" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Widersprüche" })).toBeVisible();
  const card = page.locator(`#widerspruch-${appealId}`);
  await expect(card).toHaveAccessibleName("Paul Mertens");
  await expect(card.getByText("Ich halte die Sperre für ungerecht")).toBeVisible();
  await expectAccessible(page, "/admin/sicherheit/widersprueche");
  await card.getByLabel("Annehmen (Sanktion aufheben)").check();
  await card.getByLabel("Begründung (bekommt die Person per Mail)").fill("Die Schilderung ließ sich nicht bestätigen.");
  await card.getByRole("button", { name: "Entscheiden" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Entscheiden" }).click();
  await expect.poll(async () => (await sql`select status from safety.appeals where id = ${appealId}::uuid`)[0]!.status).toBe("accepted");
  expect((await sql`select lifted_at from safety.sanctions where id = ${prov!.id}::uuid`)[0]!.lifted_at).not.toBeNull();
  await ctx.close();
});

test("Hinweise: Transkript nur mit Begründung und protokolliert, Hinweis erledigen", async ({ browser }) => {
  const { a } = await memberPair("Rike", "Sven");
  const { flagId, sessionId } = await agentFlagWithTranscript(a.id);
  const ctx = await browser.newContext({ storageState: admin.state });
  const page = await ctx.newPage();
  const console = watchConsole(page);
  await page.goto("/admin/hinweise");
  await expect(page).toHaveURL(/\/admin\/sicherheit\/hinweise$/);
  await expect(page.getByRole("heading", { level: 1, name: "Sicherheits-Hinweise" })).toBeVisible();
  await expectAccessible(page, "/admin/sicherheit/hinweise");
  const item = page.locator(`li.flag[data-flag="${flagId}"]`);
  await expect(item).toContainText("Krise im Gespräch");
  await item.getByRole("button", { name: "Transkript für diesen Sicherheitsfall öffnen" }).click();
  await expect(item.getByText("Der Zugriff wird protokolliert.")).toBeVisible();
  await item.getByLabel("Begründung für den Zugriff").fill("kurz");
  await item.getByRole("button", { name: "Transkript öffnen" }).click();
  await expect(item.getByText("Bitte eine Begründung mit mindestens 10 Zeichen angeben.")).toBeVisible();
  await item.getByLabel("Begründung für den Zugriff").fill("Hinweis auf eine Krise im Erstgespräch prüfen.");
  await item.getByRole("button", { name: "Transkript öffnen" }).click();
  // Mit der Funktion der Härtung: Transkript; ohne sie: klare Fehlermeldung statt Absturz.
  const turns = item.getByText("mir wächst gerade alles über den Kopf", { exact: false });
  const missing = item.getByText("Funktion api.admin_safety_transcript fehlt", { exact: false });
  await expect(turns.or(missing)).toBeVisible();
  const hasFn = (await sql`select count(*)::int as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'api' and p.proname = 'admin_safety_transcript'`)[0]!.n > 0;
  if (hasFn) {
    await expect(turns).toBeVisible();
    expect((await sql`select count(*)::int as n from ops.audit_log where target_id = ${sessionId} and actor = ${admin.id}::uuid`)[0]!.n).toBeGreaterThan(0);
  } else {
    await expect(missing).toBeVisible();
  }
  await expectAccessible(page, "Transkript-Zugriff");

  // Hinweis erledigen
  await item.getByLabel("Ergebnis").fill("Mit der Person gesprochen, Hilfe vermittelt.");
  await item.getByRole("button", { name: "Erledigt" }).click();
  await expect.poll(async () => (await sql`select outcome from safety.safety_flags where id = ${flagId}::uuid`)[0]!.outcome).toBe("Mit der Person gesprochen, Hilfe vermittelt.");
  console.expectClean();
  await ctx.close();
});
