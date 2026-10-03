// Mitteilungen (Web-Push) im Konto: Einwilligung, VAPID-Schlüssel aus push-key, Abo über den Service Worker,
// api.save_push_subscription, Liste, Entfernen, überall ausschalten. Ein echtes Abo beim Push-Dienst ist im
// Testbrowser nicht möglich (kein Push-Dienst); pushManager.subscribe wird deshalb im Browser ersetzt.
// Echte Zustellung und Klick auf die Mitteilung: auf echten Geräten prüfen (docs/bereiche/ui-gespraech-abende.md).
import { expect, test, type Page } from "@playwright/test";
import { sql } from "./helpers/backend";
import { expectAccessible, watchConsole } from "./helpers/checks";
import { stack } from "./helpers/env";
import { member } from "./helpers/abende";
import { loginByLink } from "./helpers/member";

async function fakePushService(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __push: { options: PushSubscriptionOptionsInit | null; sub: unknown } };
    w.__push = { options: null, sub: null };
    const b64 = (n: number, c: string) => c.repeat(n);
    // Wie beim echten Browser bleibt das Abo über ein Neuladen bestehen (hier in sessionStorage).
    const make = (stored?: string) => {
      const endpoint = stored ?? `https://push.example.test/fermata/${Math.random().toString(36).slice(2)}`;
      sessionStorage.setItem("fake-push-endpoint", endpoint);
      const sub = {
        endpoint,
        expirationTime: null,
        options: {},
        getKey: () => null,
        toJSON: () => ({ endpoint, expirationTime: null, keys: { p256dh: `B${b64(86, "A")}`, auth: b64(22, "Q") } }),
        unsubscribe: async () => {
          w.__push.sub = null;
          sessionStorage.removeItem("fake-push-endpoint");
          return true;
        },
      };
      return sub;
    };
    const kept = sessionStorage.getItem("fake-push-endpoint");
    if (kept) w.__push.sub = make(kept);
    PushManager.prototype.subscribe = async function (options?: PushSubscriptionOptionsInit) {
      w.__push.options = options ?? null;
      w.__push.sub = make();
      return w.__push.sub as PushSubscription;
    };
    PushManager.prototype.getSubscription = async function () {
      return w.__push.sub as PushSubscription | null;
    };
  });
}

test("Mitteilungen einschalten: Einwilligung, Schlüssel, Abo speichern, Geräte, ausschalten", async ({ page, context }) => {
  const console = watchConsole(page);
  await context.grantPermissions(["notifications"]);
  await fakePushService(page);
  const m = await member("Mira");
  await loginByLink(page, m.email);

  await page.goto("/konto");
  await page.locator("#mitteilungen").getByRole("link", { name: "Mitteilungen einrichten" }).click();
  await expect(page).toHaveURL(/\/konto\/mitteilungen$/);
  await expect(page.getByRole("heading", { level: 1, name: "Mitteilungen" })).toBeVisible();
  await expect(page.locator("#regeln")).toContainText("Zwischen 22 und 8 Uhr kommen keine Mitteilungen");
  await expect(page.locator("#iphone").getByRole("link", { name: "Anleitung: Zum Home-Bildschirm" })).toHaveAttribute("href", "/installieren");
  await expectAccessible(page, "/konto/mitteilungen (Einwilligung)");

  await page.getByLabel("Ich habe den Text gelesen und willige ein.").check();
  await page.getByRole("button", { name: "Zustimmen und weiter" }).click();
  await expect(page.getByRole("button", { name: "Mitteilungen einschalten" })).toBeVisible();
  await expect(page.getByText("Noch auf keinem Gerät eingeschaltet.")).toBeVisible();

  await page.getByRole("button", { name: "Mitteilungen einschalten" }).click();
  await expect(page.locator(".push-device")).toContainText("Auf diesem Gerät eingeschaltet.");
  // Der VAPID-Schlüssel aus push-key ging an pushManager.subscribe
  const key = await page.evaluate(() => {
    const o = (window as unknown as { __push: { options: { applicationServerKey?: Uint8Array; userVisibleOnly?: boolean } } }).__push.options;
    return { visible: o.userVisibleOnly, bytes: o.applicationServerKey ? Array.from(o.applicationServerKey).length : 0 };
  });
  expect(key).toEqual({ visible: true, bytes: 65 });
  expect(stack.VAPID_PUBLIC_KEY).toBeTruthy();
  const rows = await sql`select endpoint, platform, p256dh from app.push_subscriptions where user_id = ${m.id}::uuid`;
  expect(rows).toHaveLength(1);
  expect(rows[0]!.endpoint).toMatch(/^https:\/\/push\.example\.test\/fermata\//);
  expect(rows[0]!.platform).toBe("desktop");
  await expect(page.locator(".device-list")).toContainText("Computer");
  await expect(page.locator(".device-list")).toContainText("dieses Gerät");
  await expectAccessible(page, "/konto/mitteilungen (an)");

  // Ein anderes Gerät erscheint in der Liste und lässt sich entfernen
  await sql`insert into app.push_subscriptions (user_id, endpoint, p256dh, auth, platform)
            values (${m.id}::uuid, 'https://push.example.test/fermata/anderes-geraet', ${`B${"C".repeat(86)}`}, ${"D".repeat(22)}, 'android')`;
  await page.reload();
  await expect(page.locator(".device-list__item")).toHaveCount(2);
  await page.getByRole("button", { name: /^Android vom .* entfernen$/ }).click();
  await expect(page.locator(".device-list__item")).toHaveCount(1);
  const [{ n }] = (await sql`select count(*)::int as n from app.push_subscriptions where user_id = ${m.id}::uuid and platform = 'android'`) as unknown as [{ n: number }];
  expect(n).toBe(0);

  // Auf diesem Gerät ausschalten
  await page.getByRole("button", { name: "Auf diesem Gerät ausschalten" }).click();
  await expect(page.locator(".push-device")).toContainText("Auf diesem Gerät aus.");
  const after = await sql`select count(*)::int as n from app.push_subscriptions where user_id = ${m.id}::uuid`;
  expect(after[0]!.n).toBe(0);

  // Wieder an, dann überall aus (Widerruf der Einwilligung löscht alle Abos)
  await page.getByRole("button", { name: "Mitteilungen einschalten" }).click();
  await expect(page.locator(".push-device")).toContainText("Auf diesem Gerät eingeschaltet.");
  await page.getByRole("button", { name: "Auf allen Geräten ausschalten" }).click();
  const dialog = page.getByRole("dialog", { name: "Mitteilungen überall ausschalten?" });
  await expectAccessible(page, "Dialog überall ausschalten");
  await dialog.getByRole("button", { name: "Ja, überall ausschalten" }).click();
  await expect(page.getByRole("heading", { name: "Einwilligung für Mitteilungen" })).toBeVisible();
  const gone = await sql`select count(*)::int as n from app.push_subscriptions where user_id = ${m.id}::uuid`;
  expect(gone[0]!.n).toBe(0);
  console.expectClean();
});

test("Mitteilungen auf dem iPhone im Browser-Tab: Hinweis auf den Home-Bildschirm", async ({ browser }) => {
  const m = await member("Lea");
  const ctx = await browser.newContext({
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  const console = watchConsole(page);
  await loginByLink(page, m.email);
  await sql.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: m.id, role: "authenticated" })}, true)`;
    await tx`set local role authenticated`;
    await tx`select api.give_consent('push', (select d.version from api.legal_document('push') d))`;
  });
  await page.goto("/konto/mitteilungen");
  await expect(page.getByText("Im Browser-Tab geht das auf dem iPhone nicht. Legen Sie Fermata auf den Home-Bildschirm.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Mitteilungen einschalten" })).toHaveCount(0);
  await expectAccessible(page, "/konto/mitteilungen (iPhone)");
  console.expectClean();
  await ctx.close();
});

test("Neue Fassung der Einwilligung: alte gilt weiter, ruhiger Hinweis zum neu Bestätigen (Mitteilungen und Gespräch)", async ({ page }) => {
  const console = watchConsole(page);
  const m = await member("Ole");
  for (const kind of ["push", "gespraech"]) {
    await sql`insert into app.consents (user_id, kind, action, document_version) values (${m.id}::uuid, ${kind}, 'granted', 'e2e-alte-fassung')`;
  }
  await loginByLink(page, m.email);
  await page.goto("/konto/mitteilungen");
  const hint = page.getByText("Neue Fassung: Mitteilungen auf dem Gerät");
  await expect(hint).toBeVisible();
  await expect(page.getByRole("heading", { name: "Mitteilungen auf diesem Gerät" })).toBeVisible();
  await expectAccessible(page, "/konto/mitteilungen (neue Fassung)");
  await page.getByText("Neue Fassung lesen und neu bestätigen").click();
  await page.getByLabel("Ich habe die neue Fassung gelesen und willige ein.").check();
  await page.getByRole("button", { name: "Zustimmen und weiter" }).click();
  await expect(page).toHaveURL(/\/konto\/mitteilungen$/);
  await expect(hint).toHaveCount(0);

  await page.goto("/gespraech");
  await expect(page.getByText("Neue Fassung: Gespräch mit Viola")).toBeVisible();
  await expect(page.getByRole("button", { name: "Lieber schreiben" })).toBeEnabled();
  await expectAccessible(page, "/gespraech (neue Fassung)");
  console.expectClean();
});
