// Prüft die gebaute Seite auf das, was die strenge CSP und „keine Drittanbieter“ verlangen:
// keine Inline-Skripte, keine <style>-Blöcke, keine style- oder on*-Attribute, keine fremden Quellen.
// Läuft nach jedem Build (package.json) und in den Playwright-Tests.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const app = fileURLToPath(new URL("..", import.meta.url));
const roots = [join(app, ".vercel", "output", "static"), join(app, "dist", "client")].filter(existsSync);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

export function checkHtml(html) {
  const problems = [];
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attrs = m[1];
    if (!/\bsrc=/.test(attrs)) problems.push(`Inline-Skript: ${m[0].slice(0, 80)}`);
    else if (m[2].trim()) problems.push("Skript mit src und Inhalt");
    const src = /\bsrc="([^"]+)"/.exec(attrs)?.[1] ?? "";
    if (src && !src.startsWith("/")) problems.push(`Fremdes Skript: ${src}`);
  }
  if (/<style\b/i.test(html)) problems.push("<style>-Block");
  for (const m of html.matchAll(/<[a-z][^>]*\sstyle=/gi)) problems.push(`style-Attribut: ${m[0].slice(0, 80)}`);
  for (const m of html.matchAll(/<[a-z][^>]*\son[a-z]+=/gi)) problems.push(`Event-Attribut: ${m[0].slice(0, 80)}`);
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const href = /\bhref="([^"]+)"/.exec(m[0])?.[1] ?? "";
    if (/rel="canonical"/.test(m[0])) continue;
    if (href && !href.startsWith("/")) problems.push(`Fremde Ressource: ${m[0]}`);
  }
  for (const m of html.matchAll(/<(img|audio|video|source|iframe)\b[^>]*\bsrc="([^"]+)"/gi)) {
    if (!m[2].startsWith("/")) problems.push(`Fremde Quelle: ${m[0]}`);
  }
  if (/<iframe\b/i.test(html)) problems.push("iframe");
  return problems;
}

export function checkCss(css) {
  const problems = [];
  for (const m of css.matchAll(/url\(\s*["']?([^"')]+)/g)) {
    const u = m[1].trim();
    if (/^(https?:)?\/\//.test(u)) problems.push(`Fremde URL in CSS: ${u}`);
    else if (u.startsWith("data:")) problems.push(`data:-URL in CSS (CSP img-src 'self'): ${u.slice(0, 40)}`);
  }
  if (/@import\s+url\(\s*["']?https?:/.test(css)) problems.push("@import von fremdem Server");
  return problems;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  if (!roots.length) {
    console.error("Keine Build-Ausgabe gefunden.");
    process.exit(1);
  }
  let count = 0;
  const problems = [];
  for (const root of roots) {
    for (const file of walk(root)) {
      if (file.endsWith(".html")) {
        count++;
        for (const p of checkHtml(readFileSync(file, "utf8"))) problems.push(`${relative(app, file)}: ${p}`);
      } else if (file.endsWith(".css")) {
        for (const p of checkCss(readFileSync(file, "utf8"))) problems.push(`${relative(app, file)}: ${p}`);
      }
    }
  }
  for (const p of problems) console.error(p);
  console.log(`Build-Prüfung: ${count} HTML-Dateien, ${problems.length} Problem(e).`);
  if (problems.length) process.exit(1);
}
