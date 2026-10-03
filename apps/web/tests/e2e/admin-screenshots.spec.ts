// Bildschirmfotos des Admin-Bereichs für docs/screenshots/web/ui-admin/ (Desktop 1440 hell und dunkel, mobil 390 für Heute und Prüfung).
// Aufruf: STACK_SLOT=3 … pnpm --filter @fermata/web test:e2e -- admin-screenshots.spec.ts --project=screenshots
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { adminSession, closeOpenRuns, simulateRun, type StorageState } from "./helpers/admin";
import { agentFlagWithTranscript, asAdmin, confirmedEvening, contractActions, fileAppeal, fileReport, fixtureVenue, memberPair, waitlistEntries } from "./helpers/admin-fixtures";
import { sql } from "./helpers/backend";

const OUT = fileURLToPath(new URL("../../../../docs/screenshots/web/ui-admin/", import.meta.url));
mkdirSync(OUT, { recursive: true });

const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };

async function shoot(browser: Browser, state: StorageState, name: string, path: string, opts: { mobile?: boolean; dark?: boolean; light?: boolean; prepare?: (p: Page) => Promise<void> } = {}) {
  const variants: { device: string; viewport: typeof DESKTOP; mobile: boolean }[] = [{ device: "desktop", viewport: DESKTOP, mobile: false }];
  if (opts.mobile) variants.push({ device: "mobil", viewport: MOBILE, mobile: true });
  const schemes = [...(opts.light === false ? [] : ["light" as const]), ...(opts.dark === false ? [] : ["dark" as const])];
  for (const v of variants) {
    for (const scheme of schemes) {
      const ctx = await browser.newContext({
        viewport: v.viewport,
        isMobile: v.mobile,
        hasTouch: v.mobile,
        colorScheme: scheme,
        reducedMotion: "reduce",
        locale: "de-DE",
        timezoneId: "Europe/Berlin",
        storageState: state,
      });
      const page = await ctx.newPage();
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      if (opts.prepare) {
        await opts.prepare(page);
        await page.evaluate(() => window.scrollTo(0, 0));
      }
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(200);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect.soft(overflow, `${name} ${v.device} ${scheme}: waagrechter Überlauf`).toBeLessThanOrEqual(0);
      await page.screenshot({ path: `${OUT}${name}-${v.device}-${scheme === "light" ? "hell" : "dunkel"}.png`, fullPage: true });
      await ctx.close();
    }
  }
}

test("Bildschirmfotos Admin", async ({ browser }) => {
  test.setTimeout(900_000);
  const runId = await simulateRun(120, 42);
  await closeOpenRuns(runId);
  const admin = await adminSession(browser, "Benn");

  // Lauf: die meisten Vorschläge vorab entscheiden, drei bleiben offen (mindestens einer mit Warnung).
  const pairings = await sql`select id, (review_notes ->> 'ersatztext_verwendet')::boolean or jsonb_array_length(coalesce(review_notes -> 'hinweise', '[]')) > 0 as warn
                             from app.pairings where run_id = ${runId}::uuid order by total_score desc`;
  const warn = pairings.filter((p) => p.warn);
  const keep = new Set([...warn.slice(0, 1), ...pairings.filter((p) => !p.warn).slice(0, 2)].map((p) => p.id as string));
  let n = 0;
  for (const p of pairings) {
    if (keep.has(p.id as string)) continue;
    n++;
    await asAdmin(admin.id, (tx) =>
      n % 5 === 0 ? tx`select api.admin_reject_pairing(${p.id}::uuid, 'Zu weit auseinander')` : tx`select api.admin_approve_pairing(${p.id}::uuid, null)`,
    ).catch(() => undefined);
  }

  // Sicherheit: Meldung mit vorläufiger Sperre, Widerspruch, Hinweis des Agenten mit Transkript, Abend zum Klären.
  const venue = await fixtureVenue("Weinstube am Pfaffenteich");
  const { a, b } = await memberPair("Clara", "Dirk");
  const past = await confirmedEvening(a.id, b.id, venue, "-30 hours");
  const reportId = await fileReport(a.id, b.id, past, "uebergriff", "abend", "Beim Abschied hat er mich gegen meinen Willen festgehalten. Das Personal hat geholfen.");
  const pair2 = await memberPair("Emma", "Finn");
  const contested = await confirmedEvening(pair2.a.id, pair2.b.id, venue, "-52 hours");
  await sql`select app.evening_flag(${contested}::uuid, null, 'no_show_bestritten', 'niedrig', '{}'::jsonb)`;
  await fileReport(pair2.a.id, pair2.b.id, contested, "nicht_erschienen", "abend", "Mein Gegenüber ist nicht gekommen.");
  const [prov] = await sql`select id from safety.sanctions where user_id = ${b.id}::uuid and kind = 'vorlaeufige_sperre' and lifted_at is null`;
  if (prov) await fileAppeal(b.id, prov.id as string);
  await agentFlagWithTranscript(pair2.b.id);
  await sql`update safety.reports set due_at = now() - interval '2 hours' where id = ${reportId}::uuid`;
  await contractActions(a.id);
  await waitlistEntries(["Anna", "Bert", "Cleo", "Dora", "Ella", "Fynn"]);
  await sql`insert into public.link_hits (slug, day, count) values ('pfaffenteich', current_date, 42) on conflict (slug, day) do update set count = 42`;
  // Plätze für das Lokal
  await asAdmin(admin.id, (tx) => tx`select api.admin_create_slots(${venue}::uuid, (current_date + 1), 2, '{4,5,6}', '{19:00,19:30}', 3, false)`);

  const s = admin.state;
  await shoot(browser, s, "01-heute", "/admin", { mobile: true });
  await shoot(browser, s, "02-auswahl", "/admin/auswahl");
  await shoot(browser, s, "03-auswahl-pruefen", `/admin/auswahl/${runId}`, { mobile: true });
  await shoot(browser, s, "04-sicherheit-meldungen", "/admin/sicherheit");
  await shoot(browser, s, "05-meldung", `/admin/sicherheit/meldungen/${reportId}`);
  await shoot(browser, s, "06-polizeivorlage", `/admin/sicherheit/meldungen/${reportId}/polizei`);
  await shoot(browser, s, "07-hinweise", "/admin/sicherheit/hinweise", {
    prepare: async (p) => {
      await p.getByRole("button", { name: "Transkript für diesen Sicherheitsfall öffnen" }).first().click();
      await p.getByLabel("Begründung für den Zugriff").fill("Hinweis des Sicherheits-Agenten auf eine Krise prüfen.");
    },
  });
  await shoot(browser, s, "08-widersprueche", "/admin/sicherheit/widersprueche");
  await shoot(browser, s, "09-sanktionen", "/admin/sicherheit/sanktionen");
  await shoot(browser, s, "10-lokale", "/admin/lokale");
  await shoot(browser, s, "11-lokal", `/admin/lokale/${venue}`);
  await shoot(browser, s, "12-zeitraeume", "/admin/lokale/zeitraeume");
  await shoot(browser, s, "13-abende-klaeren", "/admin/lokale/abende");
  await shoot(browser, s, "14-warteliste", "/admin/warteliste");
  await shoot(browser, s, "15-mitgliedschaft", `/admin/mitgliedschaft?person=${a.id}`);
  await shoot(browser, s, "16-einstellungen", "/admin/einstellungen");
});
