// Tonalitätsprüfung: durchsucht sichtbare Texte nach Begriffen, die nicht zu Fermata passen.
// Regeln: scripts/tone-rules.json. Aufruf: node scripts/check-tone.mjs [datei …]
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const config = JSON.parse(readFileSync(join(root, "scripts", "tone-rules.json"), "utf8"));

function globToRegExp(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*" && glob[i + 1] === "*") {
      re += "(?:.*/)?";
      i += glob[i + 2] === "/" ? 2 : 1;
    } else if (c === "*") re += "[^/]*";
    else if (c === "?") re += "[^/]";
    else if ("\\.+^$()|{}[]".includes(c)) re += "\\" + c;
    else re += c;
  }
  return new RegExp("^" + re + "$");
}
const includes = config.include.map(globToRegExp);
const excludes = config.exclude.map(globToRegExp);

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (name === "node_modules" || name === ".git" || name === "dist" || name === ".next" || name === ".astro") continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else out.push(relative(root, full).split(sep).join("/"));
  }
  return out;
}

// Liefert die sichtbaren Textteile einer Datei samt Zeilennummer.
export function visibleText(file, source) {
  let text = source;
  const blank = (s) => s.replace(/[^\n]/g, " ");
  if (file.endsWith(".astro")) {
    text = text.replace(/^---[\s\S]*?---/, blank);
    text = text.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, blank);
    text = text.replace(/<!--[\s\S]*?-->/g, blank);
    // Attribute mit sichtbarer Wirkung behalten wir (alt, aria-label, title, placeholder).
    text = text.replace(/<[^>]*>/g, (tag) => {
      const keep = [...tag.matchAll(/\b(?:alt|aria-label|title|placeholder)="([^"]*)"/g)].map((m) => m[1]).join(" ");
      return blank(tag).replace(/^ {0,}/, keep ? keep.slice(0, tag.length) : "");
    });
    text = text.replace(/\{[^{}]*\}/g, blank);
  } else if (file.endsWith(".md")) {
    text = text.replace(/```[\s\S]*?```/g, blank).replace(/`[^`\n]*`/g, blank);
    text = text.replace(/<!--[\s\S]*?-->/g, blank);
  } else if (file.endsWith(".json")) {
    text = text.replace(/"(?:[^"\\]|\\.)*"\s*:/g, blank); // Schlüssel ausblenden
    text = text.replace(/[^"\n]+(?="|\n|$)/g, (s) => s); // Werte bleiben
  } else if (file.endsWith(".ts") || file.endsWith(".tsx")) {
    // Nur Zeichenketten-Inhalte prüfen.
    const parts = blank(text).split("");
    for (const m of text.matchAll(/(["'`])((?:\\.|(?!\1)[^\\])*)\1/g)) {
      if (m[1] === "`") {
        // ${…}-Ausdrücke ausblenden
        const inner = m[2].replace(/\$\{[^}]*\}/g, blank);
        for (let i = 0; i < inner.length; i++) parts[m.index + 1 + i] = inner[i];
      } else {
        for (let i = 0; i < m[2].length; i++) parts[m.index + 1 + i] = m[2][i];
      }
    }
    text = parts.join("");
    text = text.replace(/\/\/[^\n]*/g, blank);
  }
  return text;
}

export function checkText(file, source, rules = config.rules) {
  const findings = [];
  const text = visibleText(file, source);
  const lines = text.split("\n");
  lines.forEach((line, idx) => {
    for (const rule of rules) {
      const flags = "gi" + (rule.flags ?? "");
      const re = new RegExp(rule.pattern, flags);
      const allow = rule.allowIf ? new RegExp(rule.allowIf, "i" + (rule.flags ?? "")) : null;
      for (const m of line.matchAll(re)) {
        if (allow) {
          const window = line.slice(Math.max(0, m.index - 40), m.index + m[0].length + 5);
          if (allow.test(window)) continue;
        }
        findings.push({ file, line: idx + 1, rule: rule.id, match: m[0], reason: rule.reason, context: line.trim().slice(0, 140) });
      }
    }
  });
  return findings;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const args = process.argv.slice(2);
  const files = (args.length ? args : walk(root)).filter(
    (f) => includes.some((re) => re.test(f)) && !excludes.some((re) => re.test(f)),
  );
  const findings = files.flatMap((f) => checkText(f, readFileSync(join(root, f), "utf8")));
  for (const f of findings) {
    console.log(`${f.file}:${f.line}  [${f.rule}] „${f.match}“ – ${f.reason}\n    ${f.context}`);
  }
  console.log(`\n${files.length} Datei(en) geprüft, ${findings.length} Fund(e).`);
  if (findings.length) process.exit(1);
}
