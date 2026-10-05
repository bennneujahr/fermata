// Rechtstexte zwischen docs/recht/*.md und ops.legal_documents.
//
// Die Quelle jedes Textes für Mitglieder ist eine Datei unter docs/recht/. Der Teil, der in die Datenbank gehört,
// steht zwischen zwei Markierungen (interne Hinweise für Benn und den Anwalt bleiben draußen):
//
//   <!-- db kind="agb" version="2026-10-03-entwurf" title="Nutzungsbedingungen" -->
//   … Text …
//   <!-- /db -->
//
// toAppMarkdown() bringt den Text in die kleine Markdown-Form, die die Web-App anzeigen kann
// (apps/web/src/lib/markdown.tsx: Überschriften, Absätze, Listen, **fett**, *kursiv*; keine Links, keine Tabellen).
// Ein Deno-Test (legal_docs.test.ts) prüft, dass die Datenbank genau diesen Stand enthält.

export interface LegalSegment {
  kind: string;
  version: string;
  title: string;
  body: string;
}

const BEGIN = /^<!--\s*db\s+(.*?)\s*-->\s*$/;
const END = /^<!--\s*\/db\s*-->\s*$/;

function attrs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of s.matchAll(/([a-z_]+)="([^"]*)"/g)) out[m[1]!] = m[2]!;
  return out;
}

/** Alle markierten Abschnitte einer Datei (Rohtext, noch nicht umgewandelt). */
export function extractSegments(md: string): LegalSegment[] {
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const out: LegalSegment[] = [];
  let current: { kind: string; version: string; title: string; lines: string[] } | null = null;
  for (const line of lines) {
    const b = BEGIN.exec(line.trim());
    if (b) {
      if (current) throw new Error(`Markierung ${current.kind} nicht geschlossen`);
      const a = attrs(b[1]!);
      if (!a.kind || !a.version || !a.title) throw new Error(`Markierung unvollständig: ${line}`);
      current = { kind: a.kind, version: a.version, title: a.title, lines: [] };
      continue;
    }
    if (END.test(line.trim())) {
      if (!current) throw new Error("Ende ohne Anfang");
      out.push({ kind: current.kind, version: current.version, title: current.title, body: current.lines.join("\n") });
      current = null;
      continue;
    }
    if (current) current.lines.push(line);
  }
  if (current) throw new Error(`Markierung ${current.kind} nicht geschlossen`);
  return out;
}

function tableToList(rows: string[]): string[] {
  const cells = (r: string) =>
    r.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
  const isSep = (r: string) => /^\|?\s*:?-{2,}/.test(r.trim());
  const body = rows.filter((r) => !isSep(r));
  if (body.length === 0) return [];
  const header = cells(body[0]!);
  return body.slice(1).map((r) => {
    const c = cells(r);
    const rest = c.slice(1).map((v, i) => (v && v !== "–" ? `${header[i + 1] ?? ""}: ${v}` : "")).filter(Boolean);
    return `- ${c[0] ?? ""}${rest.length ? ` – ${rest.join(" · ")}` : ""}`;
  });
}

function inlineClean(line: string): string {
  return line
    .replace(/\[\^[^\]]+\]/g, "") // Fußnoten für Benn
    .replace(/(?<!\[)\[([^\[\]]+)\]\(([^)]+)\)/g, "$1") // Links → Text
    .replace(/`([^`]+)`/g, "$1") // Code → Text
    .replace(/\\\*/g, "∗") // „(*)“ im Muster-Formular, ohne Kursiv-Wirkung
    .replace(/[ \t]+$/g, "")
    .replace(/ {2,}/g, " ");
}

/** Rohtext eines Abschnitts → Markdown für die Web-App (und Grundlage der Mail-Fassung). */
export function toAppMarkdown(raw: string): string {
  const src = raw.replace(/\r\n?/g, "\n").split("\n")
    .filter((l) => !/^\s*<!--.*-->\s*$/.test(l))
    .map((l) => l.replace(/^\s*>\s?/, ""));
  const out: string[] = [];
  let table: string[] = [];
  const flushTable = () => {
    if (table.length) out.push(...tableToList(table));
    table = [];
  };
  for (const original of src) {
    const line = original.replace(/\s+$/, "");
    if (/^\s*\|/.test(line)) {
      table.push(line);
      continue;
    }
    flushTable();
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
      out.push("");
      continue;
    }
    const isItem = /^\s*([-*]|\d+\.)\s+/.test(line);
    const prev = out.length ? out[out.length - 1]! : "";
    const prevIsItem = /^\s*([-*]|\d+\.)\s+/.test(prev);
    // Fortsetzungszeile eines Listenpunkts (eingerückt): an den Punkt anhängen.
    if (!isItem && line.trim() && /^\s{2,}/.test(line) && prevIsItem) {
      out[out.length - 1] = `${prev} ${line.trim()}`;
      continue;
    }
    out.push(isItem ? line.trim() : line.trim() ? line.trim() : "");
  }
  flushTable();
  const cleaned = out.map(inlineClean);
  // Mehrere Leerzeilen zusammenfassen, Anfang und Ende trimmen.
  const result: string[] = [];
  for (const l of cleaned) {
    if (!l.trim() && (!result.length || !result[result.length - 1]!.trim())) continue;
    result.push(l);
  }
  while (result.length && !result[result.length - 1]!.trim()) result.pop();
  return result.join("\n");
}

/** App-Markdown → Absätze für eine Mail (Text und HTML werden aus den Absätzen gebaut). */
export function markdownToMailParagraphs(md: string): string[] {
  const plain = (s: string) => s.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*([^*]+)\*/g, "$1");
  const paragraphs: string[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) paragraphs.push(plain(para.join(" ")));
    para = [];
  };
  for (const raw of md.split("\n")) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    const h = /^#{1,6}\s+(.*)$/.exec(line);
    if (h) {
      flush();
      paragraphs.push(plain(h[1]!).toUpperCase());
      continue;
    }
    const item = /^([-*]|\d+\.)\s+(.*)$/.exec(line);
    if (item) {
      flush();
      paragraphs.push(`${/^\d/.test(item[1]!) ? item[1] : "–"} ${plain(item[2]!)}`);
      continue;
    }
    para.push(line);
  }
  flush();
  return paragraphs;
}

/** SQL-Zeichenkette mit Dollar-Quoting (für den Generator der Migration). */
export function sqlDollar(text: string, tag = "md"): string {
  if (text.includes(`$${tag}$`)) throw new Error(`Text enthält $${tag}$`);
  return `$${tag}$${text}$${tag}$`;
}
