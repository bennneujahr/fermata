// Bildschirmfotos der wichtigsten Seiten für docs/screenshots/web/ (mobil 390 px und Desktop, hell und dunkel).
// Aufruf: pnpm --filter @fermata/web screenshots (Stapel und Web-App müssen laufen, siehe docs/bereiche/web.md).
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { createAdmin, createInvitedMember, magicLinkPath, sql, uniqueEmail } from "./helpers/backend";
import { onboardedMember } from "./helpers/member";
import { totp } from "./helpers/totp";

const OUT = fileURLToPath(new URL("../../../../docs/screenshots/web/", import.meta.url));
mkdirSync(OUT, { recursive: true });

const VARIANTS = [
  { device: "mobil", viewport: { width: 390, height: 844 }, isMobile: true },
  { device: "desktop", viewport: { width: 1280, height: 860 }, isMobile: false },
] as const;
const SCHEMES = [
  { name: "hell", colorScheme: "light" },
  { name: "dunkel", colorScheme: "dark" },
] as const;

type State = Awaited<ReturnType<BrowserContext["storageState"]>>;

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

// Im ganzseitigen Bild steht die (sonst feste) Navigation unten am Ende der Seite.
const SHOT_STYLE = ".tabbar { position: static !important; } .shell__main { padding-bottom: var(--space-7) !important; }";

async function shoot(
  browser: Browser,
  name: string,
  path: string,
  state?: State,
  prepare?: (p: Page) => Promise<void>,
  schemes: readonly (typeof SCHEMES)[number][] = SCHEMES,
) {
  for (const v of VARIANTS) {
    for (const s of schemes) {
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
      await page.goto(path);
      if (prepare) await prepare(page);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(250);
      // Kein waagrechtes Scrollen (mobil wie Desktop)
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect.soft(overflow, `${name} ${v.device} ${s.name}: waagrechter Überlauf`).toBeLessThanOrEqual(0);
      await page.screenshot({ path: `${OUT}${name}-${v.device}-${s.name}.png`, fullPage: true, style: SHOT_STYLE });
      await ctx.close();
    }
  }
}

async function asUser(id: string, fn: (tx: typeof sql) => Promise<unknown>) {
  await sql.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: id, role: "authenticated" })}, true)`;
    await tx`set local role authenticated`;
    await fn(tx as unknown as typeof sql);
  });
}

const consent = (tx: typeof sql, k: string) => tx`select api.give_consent(${k}, (select d.version from api.legal_document(${k}) d))`;

test("Bildschirmfotos", async ({ browser }) => {
  test.setTimeout(600_000);
  const adminEmail = uniqueEmail("benn");
  const adminId = await createAdmin(adminEmail, "Benn");

  // Anmeldung
  await shoot(browser, "01-anmelden", "/anmelden");
  await shoot(browser, "02-code", "/anmelden/code", undefined, async (p) => {
    await p.evaluate(() => sessionStorage.setItem("fermata-login-email", "anna@beispiel.de"));
    await p.reload();
    await expect(p.getByLabel("Sechsstelliger Code")).toBeVisible();
  });

  // Onboarding Schritt für Schritt (jede Stufe eine eigene Person)
  const fresh = await createInvitedMember(uniqueEmail("anna"), adminId);
  const freshEmail = (await sql`select email from auth.users where id = ${fresh}::uuid`)[0]!.email as string;
  const sFresh = await stateFor(browser, freshEmail);
  await shoot(browser, "03-start-neu", "/start", sFresh);
  await shoot(browser, "04-einwilligung-agb", "/onboarding/einwilligungen", sFresh);
  await asUser(fresh, (tx) => consent(tx, "agb"));
  await shoot(browser, "05-einwilligung-datenschutz", "/onboarding/einwilligungen", sFresh);
  await asUser(fresh, (tx) => consent(tx, "datenschutz_kenntnis"));
  await shoot(browser, "06-einwilligung-art9", "/onboarding/einwilligungen", sFresh);
  await asUser(fresh, (tx) => consent(tx, "art9_profile"));
  await shoot(browser, "07-angaben", "/onboarding/angaben", sFresh);
  await asUser(fresh, (tx) => tx`select api.save_facts('Anna', 'Albers', '1990-05-17', '19053', 'Schwerin', null)`);
  await shoot(browser, "08-identitaet", "/onboarding/identitaet", sFresh);
  await asUser(fresh, (tx) => tx`select api.save_identity('frau', array['mann'], null)`);
  await shoot(browser, "09-ausweis-einwilligung", "/onboarding/ausweis", sFresh);
  await asUser(fresh, (tx) => consent(tx, "biometrie"));
  await shoot(browser, "10-ausweis-start", "/onboarding/ausweis", sFresh);
  const sessionId = `fake_${crypto.randomUUID()}`;
  await sql`select ops.verification_begin(${fresh}::uuid)`;
  const [ver] = await sql`select id from app.verifications where user_id = ${fresh}::uuid and status = 'started'`;
  await sql`select ops.verification_attach_session(${ver!.id}::uuid, ${sessionId})`;
  await shoot(browser, "11-ausweis-simulation", `/onboarding/ausweis/simulation?sitzung=${sessionId}`, sFresh);
  await shoot(browser, "12-ausweis-warten", "/onboarding/ausweis/zurueck", sFresh);

  // Eingerichtetes Mitglied
  const done = await onboardedMember({ first: "Mira" });
  const sDone = await stateFor(browser, done.email);
  await shoot(browser, "13-start-eingerichtet", "/start", sDone);
  await shoot(browser, "14-hilfe", "/hilfe", sDone);
  await shoot(browser, "15-konto", "/konto", sDone, undefined, [SCHEMES[0]]);
  await shoot(browser, "16-gespraech", "/gespraech", sDone, undefined, [SCHEMES[0]]);
  await shoot(browser, "17-mitgliedschaft", "/mitgliedschaft", sDone, undefined, [SCHEMES[0]]);
  await shoot(browser, "18-konto-loeschen", "/konto/loeschen", sDone, undefined, [SCHEMES[0]]);

  // Admin mit Zwei-Faktor
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(await magicLinkPath(adminEmail));
  await page.getByRole("button", { name: "Jetzt anmelden" }).click();
  await page.waitForURL(/\/admin\/mfa\/einrichten/);
  await page.getByRole("img", { name: "QR-Code für die Authenticator-App" }).waitFor();
  await shootPage(page, "19-admin-zwei-faktor");
  const secret = (await page.getByTestId("totp-secret").textContent())!.trim();
  await page.getByLabel("Code aus der App").fill(totp(secret));
  await page.getByRole("button", { name: "Bestätigen" }).click();
  await page.waitForURL(/\/admin$/);
  const sAdmin = await ctx.storageState();
  await ctx.close();
  await shoot(browser, "20-admin-uebersicht", "/admin", sAdmin);
  await shoot(browser, "21-admin-konten", "/admin/konten", sAdmin, undefined, [SCHEMES[0]]);
  await shoot(browser, "22-admin-einladen", "/admin/einladen", sAdmin, undefined, [SCHEMES[0]]);
  await shoot(browser, "23-admin-einstellungen", "/admin/einstellungen", sAdmin, undefined, [SCHEMES[0]]);
});

async function shootPage(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${OUT}${name}-desktop-hell.png`, fullPage: true });
}
