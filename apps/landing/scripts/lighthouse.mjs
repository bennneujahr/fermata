// Lighthouse für die gebaute Seite (läuft gegen einen laufenden Server, Standard http://localhost:4331).
// Nutzt das Chromium aus Playwright (PLAYWRIGHT_BROWSERS_PATH) oder CHROME_PATH.
// Aufruf: node scripts/lighthouse.mjs [basis-url]   → Tabelle + lighthouse-ergebnis.json
import { writeFileSync } from "node:fs";
import { launch } from "chrome-launcher";
import lighthouse from "lighthouse";
import desktopConfig from "lighthouse/core/config/desktop-config.js";
import { chromium } from "@playwright/test";

const base = (process.argv[2] ?? "http://localhost:4331").replace(/\/$/, "");
const pages = ["/", "/gruendungsmitglied", "/impressum", "/datenschutz", "/bestaetigen", "/willkommen"];
const categories = ["performance", "accessibility", "best-practices", "seo"];

const chrome = await launch({
  chromePath: process.env.CHROME_PATH ?? chromium.executablePath(),
  chromeFlags: ["--headless=new", "--no-sandbox", "--disable-gpu"],
});
const results = [];
try {
  for (const formFactor of ["mobile", "desktop"]) {
    for (const path of pages) {
      const runner = await lighthouse(
        base + path,
        { port: chrome.port, output: "json", logLevel: "error", onlyCategories: categories },
        formFactor === "desktop" ? desktopConfig : undefined,
      );
      const lhr = runner.lhr;
      const scores = Object.fromEntries(categories.map((c) => [c, Math.round((lhr.categories[c]?.score ?? 0) * 100)]));
      const failed = Object.values(lhr.audits)
        .filter((a) => a.score !== null && a.score < 1 && a.scoreDisplayMode !== "informative" && a.scoreDisplayMode !== "manual" && a.scoreDisplayMode !== "notApplicable")
        .map((a) => `${a.id} (${a.score})`);
      results.push({ formFactor, path, ...scores, lcp: lhr.audits["largest-contentful-paint"]?.displayValue, failed });
      console.log(`${formFactor.padEnd(7)} ${path.padEnd(20)} ${categories.map((c) => `${c}=${scores[c]}`).join("  ")}`);
      if (failed.length) console.log(`        nicht voll: ${failed.join(", ")}`);
    }
  }
} finally {
  await chrome.kill();
}
writeFileSync(new URL("../lighthouse-ergebnis.json", import.meta.url), JSON.stringify(results, null, 2));
