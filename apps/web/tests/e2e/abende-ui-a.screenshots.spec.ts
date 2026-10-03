// Bildschirmfotos Gespräch, freie Abende, Abende, Mitteilungen für docs/screenshots/web/ui-a/
// (mobil 390 px und Desktop 1440 px, hell und dunkel). Aufruf (Stapel und Web-App laufen):
//   pnpm --filter @fermata/web exec playwright test --project=screenshots tests/e2e/abende-ui-a.screenshots.spec.ts
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { magicLinkPath, sql } from "./helpers/backend";
import { asMember, berlinAt, clockTo, confirmedEvening, currentPeriod, giveConsent, member, proposedEvening, resetClock } from "./helpers/abende";

const OUT = fileURLToPath(new URL("../../../../docs/screenshots/web/ui-a/", import.meta.url));
mkdirSync(OUT, { recursive: true });

const VARIANTS = [
  { device: "mobil", viewport: { width: 390, height: 844 }, isMobile: true },
  { device: "desktop", viewport: { width: 1440, height: 900 }, isMobile: false },
] as const;
const SCHEMES = [
  { name: "hell", colorScheme: "light" },
  { name: "dunkel", colorScheme: "dark" },
] as const;

type State = Awaited<ReturnType<BrowserContext["storageState"]>>;
const SHOT_STYLE = ".tabbar { position: static !important; } .shell__main { padding-bottom: var(--space-7) !important; }";

async function stateFor(browser: Browser, email: string): Promise<State> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(await magicLinkPath(email));
  await page.getByRole("button", { name: "Jetzt anmelden" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/anmelden"));
  const s = await ctx.storageState();
  await ctx.close();
  return s;
}

async function shoot(browser: Browser, name: string, path: string, state: State, prepare?: (p: Page) => Promise<void>, init?: (p: Page) => Promise<void>) {
  for (const v of VARIANTS) {
    for (const s of SCHEMES) {
      const ctx = await browser.newContext({
        viewport: v.viewport,
        isMobile: v.isMobile,
        hasTouch: v.isMobile,
        colorScheme: s.colorScheme,
        reducedMotion: "reduce",
        locale: "de-DE",
        timezoneId: "Europe/Berlin",
        storageState: state,
        bypassCSP: true,
      });
      const page = await ctx.newPage();
      if (init) await init(page);
      await page.goto(path);
      if (prepare) await prepare(page);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(300);
      await page.evaluate(() => window.scrollTo(0, 0));
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect.soft(overflow, `${name} ${v.device} ${s.name}: waagrechter Überlauf`).toBeLessThanOrEqual(0);
      await page.screenshot({ path: `${OUT}${name}-${v.device}-${s.name}.png`, fullPage: true, style: SHOT_STYLE });
      await ctx.close();
    }
  }
}

const fakeMic = async (page: Page) =>
  page.addInitScript(() => {
    if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = async () => new AudioContext().createMediaStreamDestination().stream;
  });

test.afterAll(async () => {
  await resetClock();
});

test("Bildschirmfotos Gespräch, freie Abende, Abende, Mitteilungen", async ({ browser }) => {
  test.setTimeout(900_000);
  await resetClock();
  await currentPeriod();

  // Gespräch: Einwilligung, Wahl, Text, Stimme, Zusammenfassung
  const fresh = await member("Mira");
  const sFresh = await stateFor(browser, fresh.email);
  await shoot(browser, "01-gespraech-einwilligung", "/gespraech", sFresh);
  await giveConsent(fresh.id, "gespraech");
  await shoot(browser, "02-gespraech-start", "/gespraech", sFresh);

  const writer = await member("Lea");
  await giveConsent(writer.id, "gespraech");
  const sWriter = await stateFor(browser, writer.email);
  const closeOpen = (id: string) => async () => {
    await sql`delete from app.interview_sessions where user_id = ${id}::uuid and status in ('active', 'requested')`;
  };
  await shoot(browser, "03-gespraech-text", "/gespraech", sWriter, async (p) => {
    await p.getByRole("button", { name: "Lieber schreiben" }).click();
    await expect(p.locator(".chat__item--viola").first()).toContainText("Ich bin Viola");
    for (const t of ["Ja, gern.", "Ich bin eher ruhig, aber neugierig. Am Wochenende bin ich oft an der Ostsee."]) {
      const before = await p.locator(".chat__item--viola").count();
      await p.getByLabel("Ihre Nachricht").fill(t);
      await p.keyboard.press("Enter");
      await expect.poll(() => p.locator(".chat__item--viola").count()).toBeGreaterThan(before);
      await expect(p.locator(".chat__item--typing")).toHaveCount(0);
    }
  }, closeOpen(writer.id));

  const speaker = await member("Jonas");
  await giveConsent(speaker.id, "gespraech");
  const sSpeaker = await stateFor(browser, speaker.email);
  await shoot(
    browser,
    "04-gespraech-stimme",
    "/gespraech",
    sSpeaker,
    async (p) => {
      await p.getByRole("button", { name: "Sprechen" }).click();
      await expect(p.locator(".voice fermata-atem")).toHaveAttribute("state", "hoert");
      await p.evaluate("window.__violaFake.caption('person', 'Ich koche gern für Freunde.')");
      await p.evaluate("window.__violaFake.caption('viola', 'Was ist Ihnen an einem gemeinsamen Abend wichtig?')");
    },
    async (p) => {
      await closeOpen(speaker.id)();
      await fakeMic(p);
    },
  );

  // Zusammenfassung (Entwurf) – Sitzung direkt anlegen
  const [sess] = await sql`
    insert into app.interview_sessions (user_id, kind, mode, status, address_form, tier_depth, started_at, ended_at, summary_draft, summary_status, end_reason, ai_notice_at)
    values (${writer.id}::uuid, 'erstgespraech', 'text', 'completed', 'sie', 'auftakt', now() - interval '25 minutes', now() - interval '2 minutes',
            'Sie sind eher ruhig und neugierig, verbringen Ihre Wochenenden gern an der Ostsee und kochen für Freunde. Ehrlichkeit und Humor sind Ihnen wichtig. Für einen Abend wünschen Sie sich ein Gegenüber, das zuhört und gern Neues ausprobiert. Sie fahren bis etwa 30 Minuten.',
            'draft', 'fertig', now() - interval '25 minutes')
    returning id`;
  await shoot(browser, "05-gespraech-zusammenfassung", `/gespraech/${sess!.id}`, sWriter);

  // Freie Abende
  const periodId = await currentPeriod();
  await asMember(fresh.id, async (tx) => {
    const w = [
      { starts_at: await berlinAt(3, "18:30"), ends_at: await berlinAt(3, "22:00") },
      { starts_at: await berlinAt(5, "17:00"), ends_at: await berlinAt(5, "23:00") },
      { starts_at: await berlinAt(8, "19:00"), ends_at: await berlinAt(8, "22:30") },
    ];
    return tx`select api.set_availability(${periodId}::uuid, ${tx.json(w)})`;
  });
  await shoot(browser, "06-zeiten", `/zeiten/${periodId}`, sFresh);

  // Abende: Vorschlag, Liste, bestätigt, Rückmeldung, Kontakt
  const prop = await proposedEvening({ a: fresh });
  await shoot(browser, "07-abend-vorschlag", `/abende/${prop.eveningId}`, sFresh);
  await sql`update app.accounts set tier_view = 'andante' where user_id = ${fresh.id}::uuid`;
  const conf = await confirmedEvening({ a: fresh, b: await member("Jonas") });
  await asMember(conf.b.id, (tx) => tx`select api.set_recognition_hint(${conf.eveningId}::uuid, 'blaue Jacke, Buch in der Hand')`);
  await shoot(browser, "08-abende-liste", "/abende", sFresh);
  await shoot(browser, "09-abend-bestaetigt", `/abende/${conf.eveningId}`, sFresh);
  await shoot(browser, "10-start", "/start", sFresh);
  await shoot(browser, "11-mitteilungen", "/konto/mitteilungen", sFresh);
  await giveConsent(fresh.id, "push");
  await shoot(
    browser,
    "11b-mitteilungen-an",
    "/konto/mitteilungen",
    sFresh,
    async (p) => {
      await p.getByRole("button", { name: "Mitteilungen einschalten" }).click();
      await expect(p.locator(".push-device")).toContainText("Auf diesem Gerät eingeschaltet.");
    },
    async (p) => {
      await sql`delete from app.push_subscriptions where user_id = ${fresh.id}::uuid`;
      await p.context().grantPermissions(["notifications"]);
      await p.addInitScript(() => {
        let sub: unknown = null;
        const endpoint = `https://push.example.test/fermata/${Math.random().toString(36).slice(2)}`;
        PushManager.prototype.subscribe = async () => {
          sub = { endpoint, toJSON: () => ({ endpoint, keys: { p256dh: `B${"A".repeat(86)}`, auth: "Q".repeat(22) } }), unsubscribe: async () => true };
          return sub as PushSubscription;
        };
        PushManager.prototype.getSubscription = async () => sub as PushSubscription | null;
      });
    },
  );

  // Finde-Fenster und Rückmeldung (Testuhr)
  await clockTo(new Date(new Date(conf.startsAt).getTime() - 5 * 60_000).toISOString());
  await shoot(browser, "12-abend-finden", `/abende/${conf.eveningId}/finden`, sFresh);
  await clockTo(new Date(new Date(conf.startsAt).getTime() + 15 * 3_600_000).toISOString());
  await shoot(browser, "13-abend-rueckmeldung", `/abende/${conf.eveningId}/rueckmeldung`, sFresh, async (p) => {
    await p.getByRole("group", { name: "Waren Sie dort?" }).getByLabel("Ja").check();
    await p.getByRole("group", { name: "Möchten Sie Kontaktdaten tauschen?" }).getByLabel("Ja, Kontakt teilen").check();
  });
  await giveConsent(fresh.id, "kontakttausch");
  await giveConsent(conf.b.id, "kontakttausch");
  await asMember(fresh.id, (tx) => tx`select api.submit_feedback(${conf.eveningId}::uuid, true, true, true, 'ja', true, 5, 4, null, true, true)`);
  await asMember(conf.b.id, (tx) => tx`select api.submit_feedback(${conf.eveningId}::uuid, true, true, true, 'ja', true, 5, 5, null, true, false)`);
  await shoot(browser, "14-abend-kontakt", `/abende/${conf.eveningId}`, sFresh);
  await resetClock();
});
