// Sehr kleiner, sicherer Markdown-Leser für Rechtstexte aus ops.legal_documents.
// Kann: Überschriften (# bis ####), Absätze, Listen (- und 1.), Zitate (>), Trennlinien (---), Tabellen (| a | b |),
// **fett**, *kursiv*, `Code` und Links [Text](Adresse) mit https:, http:, mailto:, tel: oder eigener Adresse (/…).
// Kein HTML: Alles andere bleibt Text (React maskiert ihn).
import { Fragment, type ReactNode } from "react";
import "./markdown.css";

export type Block =
  | { type: "h"; level: 2 | 3 | 4; text: string }
  | { type: "p"; text: string }
  | { type: "ul" | "ol"; items: string[] }
  | { type: "quote"; text: string }
  | { type: "hr" }
  | { type: "table"; head: string[]; rows: string[][] };

function cells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

export function parseMarkdown(src: string): Block[] {
  const blocks: Block[] = [];
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  let para: string[] = [];
  let quote: string[] = [];
  let list: { type: "ul" | "ol"; items: string[] } | null = null;
  let table: string[] = [];
  const flushPara = () => {
    if (para.length) blocks.push({ type: "p", text: para.join(" ").trim() });
    para = [];
  };
  const flushQuote = () => {
    if (quote.length) blocks.push({ type: "quote", text: quote.join(" ").trim() });
    quote = [];
  };
  const flushList = () => {
    if (list) blocks.push(list);
    list = null;
  };
  const flushTable = () => {
    if (!table.length) return;
    const rows = table.map(cells).filter((r) => !r.every((c) => /^:?-{2,}:?$/.test(c)));
    const [head, ...body] = rows;
    if (head) blocks.push({ type: "table", head, rows: body });
    table = [];
  };
  const flushAll = () => {
    flushPara();
    flushQuote();
    flushList();
    flushTable();
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    const ul = /^\s*[-*]\s+(.*)$/.exec(line);
    const ol = /^\s*\d+\.\s+(.*)$/.exec(line);
    const q = /^\s*>\s?(.*)$/.exec(line);
    if (!line.trim()) {
      flushAll();
    } else if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
      flushAll();
      blocks.push({ type: "hr" });
    } else if (/^\s*\|.*\|\s*$/.test(line)) {
      flushPara();
      flushQuote();
      flushList();
      table.push(line);
    } else if (h) {
      flushAll();
      const n = h[1]!.length;
      blocks.push({ type: "h", level: n <= 2 ? 2 : n === 3 ? 3 : 4, text: h[2]!.trim() });
    } else if (q) {
      flushPara();
      flushList();
      flushTable();
      quote.push(q[1]!.trim());
    } else if (ul || ol) {
      flushPara();
      flushQuote();
      flushTable();
      const type = ul ? "ul" : "ol";
      if (!list || list.type !== type) {
        flushList();
        list = { type, items: [] };
      }
      list.items.push((ul ?? ol)![1]!.trim());
    } else {
      flushList();
      flushQuote();
      flushTable();
      para.push(line.trim());
    }
  }
  flushAll();
  return blocks;
}

/** Nur sichere Ziele für Links: https, http, mailto, tel und eigene Adressen. */
export function safeHref(url: string): string | null {
  const u = url.trim();
  if (/^\/(?!\/)/.test(u) || /^#[\w-]+$/.test(u)) return u;
  if (/^(https?:\/\/|mailto:|tel:)[^\s"'<>]+$/i.test(u)) return u;
  return null;
}

/** **fett**, *kursiv*, `Code` und [Links](…) als React-Elemente, alles andere als Text. */
export function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] !== undefined) out.push(<strong key={i++}>{m[1]}</strong>);
    else if (m[2] !== undefined) out.push(<em key={i++}>{m[2]}</em>);
    else if (m[3] !== undefined) out.push(<code key={i++}>{m[3]}</code>);
    else {
      const href = safeHref(m[5]!);
      out.push(
        href ? (
          <a key={i++} href={href} rel={/^https?:/i.test(href) ? "noopener noreferrer" : undefined}>
            {m[4]}
          </a>
        ) : (
          <Fragment key={i++}>{m[4]}</Fragment>
        ),
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ source, headingOffset = 0 }: { source: string; headingOffset?: 0 | 1 }) {
  return (
    <div className="prose">
      {parseMarkdown(source).map((b, i) => {
        if (b.type === "h") {
          const level = Math.min(4, b.level + headingOffset);
          const H = `h${level}` as "h2" | "h3" | "h4";
          return <H key={i}>{inline(b.text)}</H>;
        }
        if (b.type === "p") return <p key={i}>{inline(b.text)}</p>;
        if (b.type === "quote")
          return (
            <blockquote key={i}>
              <p>{inline(b.text)}</p>
            </blockquote>
          );
        if (b.type === "hr") return <hr key={i} />;
        if (b.type === "table")
          return (
            <div key={i} className="table-wrap" role="region" aria-label={b.head.join(", ")} tabIndex={0}>
              <table className="table">
                <thead>
                  <tr>
                    {b.head.map((c, j) => (
                      <th key={j} scope="col">
                        {inline(c)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {b.rows.map((r, j) => (
                    <tr key={j}>
                      {r.map((c, k) => (
                        <td key={k}>{inline(c)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        const L = b.type;
        return (
          <L key={i}>
            {b.items.map((it, j) => (
              <li key={j}>{inline(it)}</li>
            ))}
          </L>
        );
      })}
    </div>
  );
}

export { Fragment };
