// Erzeugt PNG-Symbole und favicon.ico aus den SVG-Vorlagen.
import sharp from "sharp";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "icons");
mkdirSync(out, { recursive: true });
const svg = (name) => readFileSync(join(root, "svg", name));

// Favicon für kleine Größen: helle Fassung ohne Media-Query (PNG kennt kein Farbschema).
const faviconLight = Buffer.from(
  svg("favicon.svg")
    .toString()
    .replace(/@media[^}]*}[^}]*}/, ""),
);

async function png(input, size, file) {
  // Mit doppelter Auflösung rastern, dann verkleinern: saubere Kanten auch bei 16 px.
  const viewBox = Number(/viewBox="0 0 (\d+)/.exec(input.toString())?.[1] ?? 32);
  const density = Math.min(2400, Math.ceil((72 * size * 2) / viewBox));
  const buf = await sharp(input, { density }).resize(size, size).png({ compressionLevel: 9 }).toBuffer();
  if (file) writeFileSync(join(out, file), buf);
  return buf;
}

// ICO mit eingebetteten PNGs (von allen aktuellen Browsern unterstützt).
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const dir = Buffer.alloc(16 * images.length);
  let offset = 6 + dir.length;
  images.forEach(({ size, data }, i) => {
    const o = i * 16;
    dir.writeUInt8(size >= 256 ? 0 : size, o);
    dir.writeUInt8(size >= 256 ? 0 : size, o + 1);
    dir.writeUInt8(0, o + 2);
    dir.writeUInt8(0, o + 3);
    dir.writeUInt16LE(1, o + 4);
    dir.writeUInt16LE(32, o + 6);
    dir.writeUInt32LE(data.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += data.length;
  });
  return Buffer.concat([header, dir, ...images.map((i) => i.data)]);
}

const sizes = [16, 32, 48];
const icoImages = [];
for (const size of sizes) icoImages.push({ size, data: await png(faviconLight, size) });
writeFileSync(join(out, "favicon.ico"), ico(icoImages));
writeFileSync(join(out, "favicon.svg"), svg("favicon.svg"));
await png(svg("app-icon.svg"), 180, "apple-touch-icon.png");
await png(svg("app-icon.svg"), 192, "icon-192.png");
await png(svg("app-icon.svg"), 512, "icon-512.png");
await png(svg("app-icon-maskable.svg"), 512, "icon-maskable-512.png");
await png(svg("app-icon.svg"), 96, "badge-96.png");
console.log("Symbole erzeugt in", out);
