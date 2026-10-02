// Prüft die Kontraste aller in packages/tokens/tokens.json genannten Farbpaare
// für helles und dunkles Farbschema nach WCAG 2.1 (relative Leuchtdichte).
import { readFileSync } from "node:fs";

const tokens = JSON.parse(readFileSync(new URL("../packages/tokens/tokens.json", import.meta.url), "utf8"));

function channel(c) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}
function luminance(hex) {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}
export function contrast(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

let failed = 0;
for (const scheme of Object.keys(tokens.color)) {
  const palette = tokens.color[scheme];
  for (const { fg, bg, min, use } of tokens.contrastPairs) {
    const ratio = contrast(palette[fg], palette[bg]);
    const ok = ratio >= min;
    if (!ok) failed++;
    console.log(
      `${ok ? "ok  " : "FEHLER"} ${scheme.padEnd(5)} ${fg.padEnd(15)} auf ${bg.padEnd(13)} ${ratio.toFixed(2).padStart(5)} : 1 (min. ${min}) – ${use}`,
    );
  }
}
if (failed) {
  console.error(`\n${failed} Farbpaar(e) unter dem Mindestkontrast.`);
  process.exit(1);
}
console.log("\nAlle Kontraste erfüllt.");
