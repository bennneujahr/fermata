// Admin „Heute“: Arbeitslisten und Kennzahlen (k-anonym), Zugriff nur mit Zwei-Faktor, Mitglieder sehen 404.
import { expect, test } from "@playwright/test";
import { adminSession, type AdminSession } from "./helpers/admin";
import { confirmedEvening, fileReport, fixtureVenue, memberPair } from "./helpers/admin-fixtures";
import { magicLinkPath, sql } from "./helpers/backend";
import { expectAccessible, watchConsole } from "./helpers/checks";
import { loginByLink, onboardedMember } from "./helpers/member";

test.describe.configure({ mode: "serial" });

let admin: AdminSession;

test.beforeAll(async ({ browser }) => {
  admin = await adminSession(browser);
});

test("Heute: Meldung mit Frist, Hinweise, Kennzahlen mit k-Anonymität", async ({ browser }) => {
  const venue = await fixtureVenue();
  const { a, b } = await memberPair("Hanna", "Ivo");
  const evening = await confirmedEvening(a.id, b.id, venue, "-26 hours");
  const reportId = await fileReport(a.id, b.id, evening, "belaestigung");
  await sql`update safety.reports set due_at = now() - interval '3 hours' where id = ${reportId}::uuid`;

  const ctx = await browser.newContext({ storageState: admin.state });
  const page = await ctx.newPage();
  const console = watchConsole(page);
  await page.goto("/admin");
  await expect(page.getByRole("heading", { level: 1, name: "Heute" })).toBeVisible();
  const reports = page.getByRole("region", { name: "Meldungen", exact: true });
  await expect(reports.getByText(/überfällig seit 3 Std\./).first()).toBeVisible();
  await expect(reports.getByRole("link", { name: "Belästigung" }).first()).toBeVisible();
  await expect(page.getByRole("region", { name: "Sicherheits-Hinweise", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Kennzahlen" })).toBeVisible();
  await expect(page.getByText("Zahlen unter 5 stehen als „< 5“", { exact: false })).toBeVisible();
  // Trichter: Zeilen mit Zahl oder „< 5“, nie eine 1–4
  const funnel = page.getByRole("region", { name: "Einrichtung der Konten", exact: true }).first().getByRole("table");
  for (const cell of await funnel.locator("tbody td.num").allTextContents()) expect(cell.trim()).toMatch(/^(< 5|0|[5-9]|\d{2,}|\d{1,3}(\.\d{3})+)$/);
  await expectAccessible(page, "/admin (Heute)");
  // Kennzahlen-Abruf steht im Audit
  const [audit] = await sql`select count(*)::int as n from ops.audit_log where action = 'kpi.viewed' and actor = ${admin.id}::uuid`;
  expect(audit!.n).toBeGreaterThan(0);
  // Link führt zur Meldung
  await reports.getByRole("link", { name: "Belästigung" }).first().click();
  await expect(page).toHaveURL(/\/admin\/sicherheit\/meldungen\//);
  console.expectClean();
  await ctx.close();
});

test("Heute auf dem Telefon: keine waagrechte Scrollleiste, barrierefrei", async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: admin.state, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto("/admin");
  await expect(page.getByRole("heading", { level: 1, name: "Heute" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  await expectAccessible(page, "/admin mobil");
  await ctx.close();
});

test("Admin ohne Zwei-Faktor-Sitzung muss den Code eingeben, die Datenbank lehnt aal1 ab", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(await magicLinkPath(admin.email));
  await page.getByRole("button", { name: "Jetzt anmelden" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/anmelden"));
  for (const path of ["/admin/auswahl", "/admin/sicherheit", "/admin/lokale", "/admin/warteliste", "/admin/mitgliedschaft"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/admin\/mfa\/bestaetigen/);
    await expect(page.getByLabel("Code aus der App")).toBeVisible();
  }
  // Direkter RPC-Aufruf mit aal1-Token: abgelehnt
  const cookies = await ctx.cookies();
  expect(cookies.some((c) => c.name.includes("auth-token"))).toBe(true);
  await ctx.close();
  for (const fn of ["admin_today", "admin_kpis", "admin_venues", "admin_reports", "admin_match_runs"]) {
    await expect(
      sql.begin(async (tx) => {
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: admin.id, role: "authenticated", aal: "aal1" })}, true)`;
        await tx`set local role authenticated`;
        await tx.unsafe(`select * from api.${fn}()`);
      }),
      fn,
    ).rejects.toThrow(/Zwei-Faktor/);
  }
});

test("Mitglieder sehen keinen Admin-Bereich (404), auch nicht die neuen Seiten", async ({ page }) => {
  const m = await onboardedMember({ first: "Jule" });
  await loginByLink(page, m.email);
  for (const path of ["/admin", "/admin/auswahl", "/admin/sicherheit/hinweise", "/admin/lokale/neu", "/admin/warteliste", "/admin/mitgliedschaft"]) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(404);
  }
});
