// Erzeugt public/og.png (1200 × 630), das Vorschaubild beim Teilen (z. B. des Einladungslinks).
// Einmalig ausführen, wenn sich Marke oder Text ändern: node scripts/og-image.mjs
// Läuft lokal im Browser von Playwright mit den selbst gehosteten Schriften; das Ergebnis ist eine statische Datei.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { tokens } from "../../../packages/tokens/src/index.ts";

const fonts = fileURLToPath(new URL("../../../packages/brand/fonts/", import.meta.url));
// Nur in diesem Erzeugungsskript als data:-URL eingebettet (die Seite selbst lädt Schriften als Dateien).
const font = (file) => `data:font/woff2;base64,${readFileSync(fonts + file).toString("base64")}`;
const c = tokens.color.light;
const mark =
  '<svg viewBox="0 0 120 72" width="210"><path fill="currentColor" d="M3.2 64.6C3.4 28.6 28 5 60 5s56.6 23.6 56.8 59.6c0 1.3-1.9 1.4-2.1.1C110.6 36.2 88.8 15.4 60 15.4S9.4 36.2 5.3 64.7c-.2 1.3-2.1 1.2-2.1-.1Z"/><circle fill="currentColor" cx="60" cy="56" r="7.6"/></svg>';
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: F; src: url("${font("fraunces-latin-wght-normal.woff2")}"); font-weight: 100 900; }
@font-face { font-family: F; font-style: italic; src: url("${font("fraunces-latin-wght-italic.woff2")}"); font-weight: 100 900; }
@font-face { font-family: S; src: url("${font("source-sans-3-latin-wght-normal.woff2")}"); font-weight: 200 900; }
html, body { margin: 0; width: 1200px; height: 630px; }
body { display: grid; grid-template-columns: 420px 1fr; align-items: center; padding: 0 90px; box-sizing: border-box;
  background: radial-gradient(520px 420px at 230px 330px, ${c["brass-decor"]}38, transparent 70%),
              radial-gradient(600px 500px at 1200px 630px, ${c.wine}55, transparent 70%), ${c.night};
  color: ${c["on-night"]}; font-family: S; }
.mark { color: ${c["brass-decor"]}; display: grid; place-items: center; }
.eyebrow { font: 600 20px/1 S; letter-spacing: .18em; text-transform: uppercase; color: ${c["brass-decor"]}; }
h1 { margin: 26px 0 0; font: 380 104px/1 F; letter-spacing: .02em; }
p { margin: 26px 0 0; font: italic 340 46px/1.15 F; color: ${c["on-night-muted"]}; }
</style></head><body><div class="mark">${mark}</div><div>
<div class="eyebrow">Zuerst in Westmecklenburg</div><h1>Fermata</h1><p>Weniger Profile.<br>Ein echter Abend.</p></div></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html, { waitUntil: "load" });
await page.evaluate(() => document.fonts.ready);
writeFileSync(new URL("../public/og.png", import.meta.url), await page.screenshot({ type: "png" }));
await browser.close();
console.log("public/og.png erzeugt.");
