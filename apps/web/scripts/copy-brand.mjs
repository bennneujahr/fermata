// Kopiert Symbole der Marke (packages/brand) nach public/brand, damit Manifest, Favicon und
// Service Worker sie unter festen Pfaden finden. Die Dateien sind Build-Ergebnis (nicht im Git).
import { copyFileSync, mkdirSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const src = join(root, "..", "..", "packages", "brand", "icons");
const dest = join(root, "public", "brand");
mkdirSync(dest, { recursive: true });
for (const f of readdirSync(src)) copyFileSync(join(src, f), join(dest, f));
copyFileSync(join(root, "..", "..", "packages", "brand", "svg", "fermate-graviert.svg"), join(dest, "fermate-graviert.svg"));
console.log(`Marke kopiert nach ${dest}`);
