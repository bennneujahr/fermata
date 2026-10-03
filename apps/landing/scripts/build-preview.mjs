// Vorschau zum Ansehen (z. B. als privates Claude-Artifact): baut die Seite mit PUBLIC_PREVIEW=1
// (Formular sendet nichts, Willkommensseite mit Beispieldaten) und schreibt nach dist-preview/
// eine Fassung mit relativen Pfaden. Die Startseite liegt dort als fermata-landingpage.html
// ohne <html>/<head>/<body>-Rahmen; alle anderen Dateien liegen daneben.
import { execSync } from "node:child_process";
import { cpSync, existsSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const out = join(root, "dist-preview");
execSync("pnpm build", { cwd: root, stdio: "inherit", env: { ...process.env, FERMATA_ADAPTER: "node", PUBLIC_PREVIEW: "1" } });
rmSync(out, { recursive: true, force: true });
cpSync(join(root, "dist", "client"), out, { recursive: true });
rmSync(join(out, "robots.txt"), { force: true });
renameSync(join(out, "_astro"), join(out, "assets")); // Namen mit „_“ sind beim Artifact-Dienst reserviert

const pages = readdirSync(out).filter((f) => f.endsWith(".html")).map((f) => f.slice(0, -5));
function fixLinks(html) {
  let s = html.replaceAll('"/_astro/', '"assets/');
  s = s.replace(/(href|src)="\/([A-Za-z0-9_.-]*)(#[^"]*)?"/g, (all, attr, path, frag = "") => {
    if (path === "") return `${attr}="index.html${frag}"`;
    if (pages.includes(path)) return `${attr}="${path}.html${frag}"`;
    if (path.includes(".")) return `${attr}="${path}${frag}"`;
    return all;
  });
  return s.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/g, "");
}
for (const f of readdirSync(out).filter((f) => f.endsWith(".html"))) {
  writeFileSync(join(out, f), fixLinks(readFileSync(join(out, f), "utf8")));
}
for (const f of readdirSync(join(out, "assets")).filter((f) => f.endsWith(".css"))) {
  const p = join(out, "assets", f);
  writeFileSync(p, readFileSync(p, "utf8").replaceAll("url(/_astro/", "url("));
}
const index = readFileSync(join(out, "index.html"), "utf8");
const head = /<head>([\s\S]*?)<\/head>/.exec(index)[1];
const body = /<body[^>]*>([\s\S]*)<\/body>/.exec(index)[1];
const links = head.match(/<link rel="stylesheet"[^>]*>/g) ?? [];
writeFileSync(
  join(out, "fermata-landingpage.html"),
  ['<title>Fermata Landingpage</title>', '<meta name="color-scheme" content="light dark">', ...links, body.replaceAll('href="index.html#', 'href="#')].join("\n"),
);
rmSync(join(out, "index.html"));
if (!existsSync(join(out, "fermata-landingpage.html"))) process.exit(1);
console.log("Vorschau in", out);
