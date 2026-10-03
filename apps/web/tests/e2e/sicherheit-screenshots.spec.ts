// Bildschirmfotos Mitgliedschaft, Sicherheit und öffentliche Seiten (ui-member-b) für docs/screenshots/web/ui-b/
// (mobil 390 px und Desktop 1440 px, hell und dunkel für die Hauptseiten).
// Aufruf (Stapel und Web-App laufen): pnpm --filter @fermata/web exec playwright test --project=screenshots tests/e2e/sicherheit-screenshots.spec.ts
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { magicLinkPath, sql } from "./helpers/backend";
import { onboardedMember } from "./helpers/member";
import { activeMembership, confirmedEvening, fakeStripe, sanction, venueToken } from "./helpers/ui-b";

const OUT = fileURLToPath(new URL("../../../../docs/screenshots/web/ui-b/", import.meta.url));
mkdirSync(OUT, { recursive: true });

const VARIANTS = [
  { device: "mobil", viewport: { width: 390, height: 844 }, isMobile: true },
  { device: "desktop", viewport: { width: 1440, height: 900 }, isMobile: false },
] as const;
const LIGHT = [{ name: "hell", colorScheme: "light" }] as const;
const BOTH = [
  { name: "hell", colorScheme: "light" },
  { name: "dunkel", colorScheme: "dark" },
] as const;
type Scheme = (typeof BOTH)[number];
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

async function shoot(
  browser: Browser,
  name: string,
  path: string | (() => Promise<string>),
  opts: {
    state?: State | (() => Promise<State>);
    schemes?: readonly Scheme[];
    prepare?: (p: Page) => Promise<void>;
    stripe?: boolean;
    /** false: nur der sichtbare Ausschnitt (z. B. für Dialoge). */
    fullPage?: boolean;
  } = {},
) {
  for (const v of VARIANTS) {
    for (const s of opts.schemes ?? BOTH) {
      const state = typeof opts.state === "function" ? await opts.state() : opts.state;
      const ctx = await browser.newContext({
        viewport: v.viewport,
        isMobile: v.isMobile,
        hasTouch: v.isMobile,
        colorScheme: s.colorScheme,
        reducedMotion: "reduce",
        locale: "de-DE",
        timezoneId: "Europe/Berlin",
        storageState: state,
        // Wie in screenshots.spec.ts: nur so greift das Bildschirmfoto-Stylesheet (feste Navigation unten).
        bypassCSP: true,
      });
      const page = await ctx.newPage();
      if (opts.stripe) await fakeStripe(page);
      await page.goto(typeof path === "function" ? await path() : path);
      if (opts.prepare) await opts.prepare(page);
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(300);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect.soft(overflow, `${name} ${v.device} ${s.name}: waagrechter Überlauf`).toBeLessThanOrEqual(0);
      await page.screenshot({ path: `${OUT}${name}-${v.device}-${s.name}.png`, fullPage: opts.fullPage ?? true, style: SHOT_STYLE });
      await ctx.close();
    }
  }
}

async function asUser<T>(id: string, fn: (tx: typeof sql) => Promise<T>): Promise<T> {
  return (await sql.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: id, role: "authenticated" })}, true)`;
    await tx`set local role authenticated`;
    return fn(tx as unknown as typeof sql);
  })) as T;
}

test("Bildschirmfotos Mitgliedschaft und Sicherheit", async ({ browser }) => {
  test.setTimeout(900_000);

  // --- Mitgliedschaft ---
  const free = await onboardedMember({ first: "Mira" });
  const sFree = await stateFor(browser, free.email);
  await shoot(browser, "01-mitgliedschaft-gratis", "/mitgliedschaft", { state: sFree });
  await shoot(browser, "02-bestellen", "/mitgliedschaft/bestellen/andante", {
    state: sFree,
    stripe: true,
    prepare: async (p) => {
      await expect(p.locator("[data-fake-stripe=payment]")).toBeVisible();
    },
  });
  await shoot(browser, "03-bestellen-haekchen-fehlt", "/mitgliedschaft/bestellen/andante", {
    state: sFree,
    stripe: true,
    schemes: LIGHT,
    prepare: async (p) => {
      await expect(p.locator("[data-fake-stripe=payment]")).toBeVisible();
      await p.getByRole("button", { name: "Mitgliedschaft zahlungspflichtig abschließen" }).click({ force: true });
      await expect(p.getByText("Bitte setzen Sie das Häkchen", { exact: false })).toBeVisible();
    },
  });

  const active = await onboardedMember({ first: "Jana" });
  await activeMembership(active.id, "andante");
  const sActive = await stateFor(browser, active.email);
  await shoot(browser, "04-mitgliedschaft-aktiv", "/mitgliedschaft", { state: sActive });
  await shoot(browser, "05-bestellung-eingegangen", "/mitgliedschaft/bestellen/ergebnis?redirect_status=succeeded", { state: sActive, schemes: LIGHT });
  await shoot(browser, "06-kuendigen", "/mitgliedschaft/kuendigen", { state: sActive });
  await shoot(browser, "07-widerrufen", "/mitgliedschaft/widerrufen", { state: sActive, schemes: LIGHT });

  // Eingangsbestätigung: je Bild eine eigene, frisch aktive Mitgliedschaft
  const fresh = async () => {
    const m = await onboardedMember({ first: "Lena" });
    await activeMembership(m.id, "auftakt");
    return stateFor(browser, m.email);
  };
  await shoot(browser, "08-kuendigung-eingegangen", "/mitgliedschaft/kuendigen", {
    state: fresh,
    schemes: LIGHT,
    prepare: async (p) => {
      await p.getByRole("button", { name: "Jetzt kündigen", exact: true }).click();
      await expect(p.getByRole("heading", { name: "Ihre Kündigung ist eingegangen" })).toBeVisible();
    },
  });
  await shoot(browser, "09-widerruf-eingegangen", "/mitgliedschaft/widerrufen", {
    state: fresh,
    schemes: LIGHT,
    prepare: async (p) => {
      await p.getByRole("button", { name: "Widerruf bestätigen", exact: true }).click();
      await expect(p.getByRole("heading", { name: "Ihr Widerruf ist eingegangen" })).toBeVisible();
    },
  });
  await shoot(browser, "10-kuendigen-ohne-anmeldung", "/kuendigen");
  await shoot(browser, "11-widerrufen-ohne-anmeldung", "/widerrufen", { schemes: LIGHT });

  // --- Sicherheit ---
  const me = await onboardedMember({ first: "Mira" });
  const other = await onboardedMember({ first: "Jonas" });
  const third = await onboardedMember({ first: "Paul" });
  // Zwei Abende: dafür braucht Mira einen zweiten freien Abend (Gutschrift wie vom Admin).
  await sql`insert into billing.evening_ledger (user_id, kind, amount, note) values (${me.id}::uuid, 'adjust', 2, 'Bildschirmfotos')`;
  const e = await confirmedEvening(me.id, other.id, { venueName: "Weinstube am See", day: 3, time: "19:30" });
  const now = await confirmedEvening(me.id, third.id, { venueName: "Bistro Lindenhof", startsInMinutes: 30 });
  await sanction(me.id, "hinweis", "Bitte achten Sie in der Terminabstimmung auf einen freundlichen Ton.");
  await asUser(me.id, (tx) => tx`select api.report('abend', 'unangenehm', null, ${e.eveningId}::uuid, 'Test', true)`);
  const sMe = await stateFor(browser, me.email);
  await shoot(browser, "12-sicherheit", "/sicherheit", { state: sMe });
  await shoot(browser, "13-melden-zum-abend", `/sicherheit/melden?abend=${e.eveningId}`, { state: sMe });
  await shoot(browser, "14-melden-dialog", `/abende/${now.eveningId}/checkin`, {
    state: sMe,
    schemes: LIGHT,
    prepare: async (p) => {
      await p.getByRole("button", { name: "Etwas melden" }).click();
      await expect(p.getByRole("dialog", { name: "Etwas melden" })).toBeVisible();
    },
    fullPage: false,
  });
  await shoot(browser, "15-meldungen", "/sicherheit/meldungen", { state: sMe, schemes: LIGHT });
  await shoot(browser, "16-hinweise-widerspruch", "/sicherheit/sanktionen", { state: sMe, schemes: LIGHT });
  await shoot(browser, "17-abend-teilen", `/sicherheit/teilen?abend=${e.eveningId}`, {
    state: sMe,
    prepare: async (p) => {
      // Höchstens drei aktive Links je Abend: vor jedem Bild die alten zurückziehen.
      await sql`update app.trust_shares set revoked_at = now() where evening_id = ${e.eveningId}::uuid and revoked_at is null`;
      await p.reload();
      await p.getByRole("button", { name: "Link erstellen" }).click();
      await expect(p.getByLabel("Link für Ihre Vertrauensperson")).toBeVisible();
    },
  });
  await shoot(
    browser,
    "18-geteilter-abend-oeffentlich",
    async () => {
      await sql`update app.trust_shares set revoked_at = now() where evening_id = ${e.eveningId}::uuid and revoked_at is null`;
      const share = await asUser(me.id, (tx) => tx`select api.create_trust_share(${e.eveningId}::uuid) as s`);
      return `/teilen#t=${(share as unknown as { s: { token: string } }[])[0]!.s.token}`;
    },
    { prepare: async (p) => void (await expect(p.getByRole("heading", { level: 1 })).toContainText("hat einen Abend mit Ihnen geteilt")) },
  );
  await shoot(browser, "19-check-in", `/abende/${now.eveningId}/checkin`, { state: sMe });
  await shoot(browser, "20-check-in-hilfe", `/abende/${now.eveningId}/checkin`, {
    state: sMe,
    prepare: async (p) => {
      await p.getByRole("button", { name: "Ich brauche Hilfe" }).click();
      await expect(p.getByText("Fermata ist informiert.")).toBeVisible();
    },
  });
  await shoot(browser, "21-hilfe", "/hilfe", { state: sMe });

  // --- Öffentliche Seiten ---
  await shoot(browser, "22-lokal-bestaetigen", `/lokal/bestaetigen#t=${venueToken(e.reservationId)}`, {
    prepare: async (p) => void (await expect(p.getByRole("button", { name: "Reservierung bestätigen" })).toBeVisible()),
  });
  await shoot(browser, "23-rechtliches-agb", "/rechtliches/agb", { schemes: LIGHT });
  await shoot(browser, "24-rechtliches-uebersicht", "/rechtliches", { schemes: LIGHT });
});
