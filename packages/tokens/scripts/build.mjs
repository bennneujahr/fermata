// Erzeugt dist/tokens.css, src/index.ts und dist/tokens.json aus tokens.json.
// Aufruf: node scripts/build.mjs [--check]  (--check schlägt fehl, wenn die Dateien veraltet sind)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tokens = JSON.parse(readFileSync(join(root, "tokens.json"), "utf8"));
const check = process.argv.includes("--check");

const header = "/* Automatisch erzeugt aus packages/tokens/tokens.json – nicht von Hand ändern. */\n";

function block(prefix, obj) {
  return Object.entries(obj)
    .map(([k, v]) => `  --${prefix}-${k}: ${v};`)
    .join("\n");
}

const shared = [
  block("font", tokens.font),
  block("text", tokens.fontSize),
  block("leading", tokens.lineHeight),
  block("space", tokens.space),
  block("radius", tokens.radius),
  block("shadow", tokens.shadow),
  block("motion", tokens.motion),
  block("layout", tokens.layout),
].join("\n");

const css =
  header +
  `:root {\n  color-scheme: light dark;\n${block("color", tokens.color.light)}\n${shared}\n}\n\n` +
  `@media (prefers-color-scheme: dark) {\n  :root:not([data-theme="light"]) {\n${block("color", tokens.color.dark).replace(/^/gm, "  ")}\n  }\n}\n\n` +
  `:root[data-theme="dark"] {\n${block("color", tokens.color.dark)}\n}\n\n` +
  `:root[data-theme="light"] {\n  color-scheme: light;\n}\n`;

const ts =
  "// Automatisch erzeugt aus packages/tokens/tokens.json – nicht von Hand ändern.\n" +
  `export const tokens = ${JSON.stringify(
    {
      color: tokens.color,
      font: tokens.font,
      fontSize: tokens.fontSize,
      lineHeight: tokens.lineHeight,
      space: tokens.space,
      radius: tokens.radius,
      shadow: tokens.shadow,
      motion: tokens.motion,
      layout: tokens.layout,
    },
    null,
    2,
  )} as const;\n\n` +
  "export type ColorName = keyof typeof tokens.color.light;\n" +
  "export type ColorScheme = keyof typeof tokens.color;\n\n" +
  "/** CSS-Variable für eine Farbe, z. B. cssVar('wine') → 'var(--color-wine)'. */\n" +
  "export function cssVar(name: ColorName): string {\n  return `var(--color-${name})`;\n}\n";

const json = JSON.stringify(tokens, null, 2) + "\n";

const outputs = [
  [join(root, "generated", "tokens.css"), css],
  [join(root, "src", "index.ts"), ts],
  [join(root, "generated", "tokens.json"), json],
];

let stale = [];
for (const [file, content] of outputs) {
  if (check) {
    if (!existsSync(file) || readFileSync(file, "utf8") !== content) stale.push(file);
  } else {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
}
if (check && stale.length) {
  console.error("Veraltete Token-Dateien (bitte `pnpm tokens:build`):\n" + stale.join("\n"));
  process.exit(1);
}
console.log(check ? "Tokens aktuell." : "Tokens erzeugt.");
