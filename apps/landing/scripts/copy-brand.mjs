// Kopiert Favicons und App-Symbole aus packages/brand nach public/ (selbst gehostet, keine Fremdserver).
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const app = join(dirname(fileURLToPath(import.meta.url)), "..");
const brand = join(app, "..", "..", "packages", "brand");
const pub = join(app, "public");
mkdirSync(pub, { recursive: true });

const files = [
  ["icons/favicon.ico", "favicon.ico"],
  // Favicon ohne <style> und ohne style-Attribute: verträgt die strenge CSP auch als eigenes Dokument.
  ["svg/favicon-plain.svg", "favicon.svg"],
  ["icons/apple-touch-icon.png", "apple-touch-icon.png"],
];
for (const [from, to] of files) {
  mkdirSync(dirname(join(pub, to)), { recursive: true });
  copyFileSync(join(brand, from), join(pub, to));
}
console.log(`Marke: ${files.length} Dateien nach public/ kopiert.`);
