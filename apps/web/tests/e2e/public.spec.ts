// Öffentliche Seiten, PWA, Sicherheits-Header und Schutz der Bereiche.
import { expect, test } from "@playwright/test";
import { expectAccessible, watchConsole } from "./helpers/checks";
import { stack } from "./helpers/env";

test("Sicherheits-Header: strenge CSP mit Nonce, keine Drittanbieter", async ({ request }) => {
  const res = await request.get("/anmelden");
  const csp = res.headers()["content-security-policy"]!;
  const script = /script-src ([^;]+)/.exec(csp)![1]!;
  expect(script).toMatch(/'nonce-[A-Za-z0-9+/=]+'/);
  expect(script).not.toContain("unsafe-inline");
  expect(script).not.toContain("unsafe-eval");
  expect(csp).toContain("frame-ancestors 'none'");
  const supabase = stack.NEXT_PUBLIC_SUPABASE_URL ?? "http://localhost:54345";
  expect(/connect-src ([^;]+)/.exec(csp)![1]).toBe(`'self' ${supabase} ${supabase.replace(/^http/, "ws")}`);
  expect(res.headers()["x-frame-options"]).toBe("DENY");
  expect(res.headers()["referrer-policy"]).toBe("same-origin");
  const nonce = /'nonce-([^']+)'/.exec(script)![1]!;
  const html = await res.text();
  // Jedes Inline-Skript trägt die Nonce.
  for (const tag of html.match(/<script(?![^>]*\bsrc=)[^>]*>/g) ?? []) expect(tag).toContain(`nonce="${nonce}"`);
  // Keine Ressourcen von Fremdseiten
  expect(html).not.toMatch(/(src|href)="https?:\/\/(?!localhost)/);
  // Nur das Auth-Cookie, ohne Anmeldung gar keins
  expect(res.headers()["set-cookie"]).toBeUndefined();
});

test("PWA: Manifest, Symbole, Service Worker", async ({ request }) => {
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest).toMatchObject({ name: "Fermata", lang: "de", display: "standalone", start_url: "/start" });
  for (const icon of manifest.icons) expect((await request.get(icon.src)).status()).toBe(200);
  const sw = await request.get("/sw.js");
  expect(sw.status()).toBe(200);
  const body = await sw.text();
  expect(body).toContain('addEventListener("push"');
  expect(body).toContain('addEventListener("notificationclick"');
  expect((await request.get("/offline")).status()).toBe(200);
});

test("Hilfe ohne Anmeldung: Notruf und Heimwegtelefon aus den Einstellungen", async ({ page }) => {
  const c = watchConsole(page);
  await page.goto("/hilfe");
  await expect(page.getByRole("heading", { level: 1, name: "Hilfe und Sicherheit" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Notruf 110 anrufen" })).toHaveAttribute("href", "tel:110");
  await expect(page.getByRole("link", { name: /030 12074182 anrufen/ })).toBeVisible();
  await expect(page.getByText("Erreichbar So–Do 21–01 Uhr, Fr/Sa 21–03 Uhr")).toBeVisible();
  await expectAccessible(page, "/hilfe (anonym)");
  await page.goto("/installieren");
  await expect(page.getByRole("heading", { name: "iPhone und iPad (Safari)" })).toBeVisible();
  await expectAccessible(page, "/installieren");
  await page.goto("/rechtliches");
  await expectAccessible(page, "/rechtliches");
  await page.getByRole("link", { name: "Hinweis zu künstlicher Intelligenz" }).click();
  await expect(page.getByText("Entwurf – der verbindliche Text folgt nach rechtlicher Prüfung.")).toBeVisible();
  await expectAccessible(page, "/rechtliches/ki_hinweis");
  await page.goto("/offline");
  await expectAccessible(page, "/offline");
  c.expectClean();
});

test("Geschützte Bereiche ohne Anmeldung → Anmeldung; unbekannte Seite → 404", async ({ page }) => {
  for (const path of ["/start", "/konto", "/onboarding/angaben", "/admin", "/admin/einstellungen"]) {
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(`/anmelden\\?weiter=${encodeURIComponent(path).replace(/[%]/g, "%")}`));
  }
  const res = await page.goto("/gibt-es-nicht");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1, name: "Diese Seite gibt es nicht" })).toBeAttached();
  await expectAccessible(page, "404");
  // Simulation nur mit Anmeldung (und nur mit DIDIT_MODE=fake)
  await page.goto("/onboarding/ausweis/simulation?sitzung=fake_00000000-0000-0000-0000-000000000000");
  await expect(page).toHaveURL(/\/anmelden/);
});

test("Tastatur: Sprunglink und sichtbarer Fokus", async ({ page }) => {
  await page.goto("/anmelden");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Zum Inhalt springen" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  const focused = page.locator(":focus");
  const outline = await focused.evaluate((el) => getComputedStyle(el).outlineStyle + " " + getComputedStyle(el).boxShadow);
  expect(outline).not.toBe("none none");
});
