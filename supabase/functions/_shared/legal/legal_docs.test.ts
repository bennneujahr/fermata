// Rechtstexte: docs/recht/*.md (Markierungen <!-- db … -->) und ops.legal_documents müssen übereinstimmen.
// Wer einen Text in docs/recht ändert, legt eine neue Fassung per Migration an (alte bleibt als Nachweis) –
// dieser Test schlägt sonst fehl. Ohne Datenbank prüft er nur die Umwandlung.
import { assert, assertEquals } from "@std/assert";
import postgres from "postgres";
import { extractSegments, markdownToMailParagraphs, toAppMarkdown } from "./markdown.ts";

const DB_URL = Deno.env.get("SUPABASE_DB_URL") ?? Deno.env.get("DATABASE_URL");
const DOCS = new URL("../../../../docs/recht/", import.meta.url);
const FILES = ["impressum.md", "datenschutzerklaerung-app.md", "agb.md", "widerrufsbelehrung.md", "ki-hinweis.md", "einwilligungen.md"];

async function allSegments() {
  const out = [];
  for (const f of FILES) {
    for (const seg of extractSegments(await Deno.readTextFile(new URL(f, DOCS)))) out.push({ file: f, ...seg });
  }
  return out;
}

Deno.test("Rechtstexte: Umwandlung in App-Markdown (Listen, Tabellen, Links, Fußnoten, Muster-Formular)", () => {
  const md = toAppMarkdown([
    "> Zitat-Zeile",
    "1. Erster Punkt, der",
    "   umbricht.",
    "- Punkt mit [Link](datei.md) und [[Platzhalter]] und `Code`[^fn]",
    "",
    "| Stufe | Preis | Abende |",
    "|---|---|---|",
    "| Andante | 149,00 € | 2 |",
    "---",
    "Hiermit widerrufe(n) ich/wir (\\*) den Vertrag (\\*).",
  ].join("\n"));
  assertEquals(md, [
    "Zitat-Zeile",
    "1. Erster Punkt, der umbricht.",
    "- Punkt mit Link und [[Platzhalter]] und Code",
    "",
    "- Andante – Preis: 149,00 € · Abende: 2",
    "",
    "Hiermit widerrufe(n) ich/wir (∗) den Vertrag (∗).",
  ].join("\n"));
  assertEquals(markdownToMailParagraphs("## Titel\n\nEin **fetter** Satz,\nder weitergeht.\n\n- Punkt\n2. Zwei"), [
    "TITEL",
    "Ein fetter Satz, der weitergeht.",
    "– Punkt",
    "2. Zwei",
  ]);
});

Deno.test("Rechtstexte: alle Pflichtarten sind in docs/recht markiert", async () => {
  const kinds = new Set((await allSegments()).map((s) => s.kind));
  for (const k of ["impressum", "datenschutz", "agb", "widerruf", "ki_hinweis", "gespraech", "art9_profile", "kontakttausch"]) {
    assert(kinds.has(k), `Markierung für ${k} fehlt`);
  }
  assert(!kinds.has("art9_health"), "art9_health wird in Phase 1 nicht angeboten");
});

Deno.test({
  name: "Rechtstexte: ops.legal_documents enthält genau die Texte aus docs/recht",
  ignore: !DB_URL,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const sql = postgres(DB_URL!, { max: 1, onnotice: () => {}, prepare: false });
    try {
      for (const seg of await allSegments()) {
        const [row] = await sql`select title, body_markdown, status from ops.legal_documents where kind = ${seg.kind} and version = ${seg.version}`;
        assert(row, `${seg.file}: ${seg.kind} ${seg.version} fehlt in ops.legal_documents (neue Fassung per Migration anlegen)`);
        assertEquals(row.title, seg.title, `${seg.kind}: Titel`);
        assertEquals(row.body_markdown, toAppMarkdown(seg.body),
          `${seg.file}: Text von ${seg.kind} ${seg.version} weicht ab – Fassungen nie ändern, neue Fassung anlegen`);
        const [cur] = await sql`select version from api.legal_document(${seg.kind})`;
        assertEquals(cur?.version, seg.version, `${seg.kind}: die Fassung aus docs/recht ist die aktuelle`);
      }
    } finally {
      await sql.end();
    }
  },
});
