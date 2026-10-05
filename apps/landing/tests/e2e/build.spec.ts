// Gebaute Seite: keine Inline-Skripte oder -Styles, keine fremden Quellen, keine Cookies, strenge CSP.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { checkCss, checkHtml } from "../../scripts/check-dist.mjs";
import { expect, test } from "../fixtures";

const root = join(import.meta.dirname, "..", "..", "dist", "client");
function files(dir: string, ext: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? files(full, ext) : full.endsWith(ext) ? [full] : [];
  });
}

test("Gebautes HTML hat keine Inline-Skripte, keine Styles, keine fremden Quellen", () => {
  const html = files(root, ".html");
  expect(html.length).toBeGreaterThanOrEqual(10);
  for (const file of html) {
    const content = readFileSync(file, "utf8");
    expect(checkHtml(content), file).toEqual([]);
    expect(content, file).toContain('http-equiv="Content-Security-Policy"');
    expect(content, file).not.toContain("unsafe-inline");
    const ids = [...content.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i), `doppelte IDs in ${file}`).toEqual([]);
  }
  for (const file of files(root, ".css")) expect(checkCss(readFileSync(file, "utf8")), file).toEqual([]);
});

test("Alle Seiten laden ohne Cookies und nur von localhost", async ({ page, context }) => {
  for (const path of ["/", "/bestaetigen", "/willkommen", "/abmelden", "/abgemeldet", "/bestaetigung-abgelaufen", "/gruendungsmitglied", "/impressum", "/datenschutz"]) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(200);
    await page.waitForLoadState("networkidle");
  }
  expect(await context.cookies()).toEqual([]);
  const storage = await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }));
  expect(storage).toEqual({ local: 0, session: 0 });
});

test("Unbekannte Seite liefert 404 mit eigener Seite", async ({ page }) => {
  const res = await page.goto("/gibt-es-nicht");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Eine Pause an der falschen Stelle.");
});

test("Hörprobe ist ohne Schalter ausgeblendet", async ({ page }) => {
  await page.goto("/#viola");
  await expect(page.locator("[data-hoerprobe]")).toHaveCount(0);
  await expect(page.locator("fermata-atem")).toBeVisible();
});

test("Einwilligungstext auf der Seite entspricht dem gespeicherten Text", async ({ page }) => {
  const { sql } = await import("../db");
  await page.goto("/#warteliste");
  const version = await page.locator('input[name="consent_version"]').inputValue();
  const [doc] = await sql`select body_markdown from ops.legal_documents where kind = 'einwilligung_warteliste' and version = ${version}`;
  const label = (await page.locator("label.check").innerText()).replace(/\s+/g, " ").trim();
  expect(label).toBe(doc!.body_markdown);
});
