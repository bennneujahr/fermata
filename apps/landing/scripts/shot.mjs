// Hilfsskript für die Gestaltung: Bildschirmfotos einer Seite (nicht Teil der Tests).
// Aufruf: node scripts/shot.mjs <pfad> <breite> <hell|dunkel> <datei> [vollständig=1]
import { chromium } from "@playwright/test";

const [path = "/", width = "1440", scheme = "hell", file = "shot.png", full = "1"] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: Number(width), height: Number(width) < 600 ? 844 : 900 },
  colorScheme: scheme === "dunkel" ? "dark" : "light",
  deviceScaleFactor: Number(width) < 600 ? 2 : 1,
});
await page.goto(`http://localhost:4331${path}`, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(400);
if (full === "tiles") {
  // In Kacheln, damit große Seiten lesbar bleiben.
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  const tile = Number(width) < 600 ? 1400 : 1500;
  for (let y = 0, i = 0; y < height; y += tile, i++) {
    const h = Math.min(tile, height - y);
    await page.screenshot({ path: file.replace(/\.png$/, `-${i}.png`), fullPage: true, clip: { x: 0, y, width: Number(width), height: h }, animations: "disabled" });
  }
} else {
  await page.screenshot({ path: file, fullPage: full === "1", animations: "disabled" });
}
await browser.close();
console.log(file);
