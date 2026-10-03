// Sehr kleiner, sicherer Markdown-Leser für Rechtstexte aus ops.legal_documents.
// Kann: ## Überschriften, Absätze, Listen (- und 1.), **fett**, *kursiv*. Kein HTML, keine Links.
import { Fragment, type ReactNode } from "react";

export type Block =
  | { type: "h"; level: 2 | 3; text: string }
  | { type: "p"; text: string }
  | { type: "ul" | "ol"; items: string[] };

export function parseMarkdown(src: string): Block[] {
  const blocks: Block[] = [];
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  let para: string[] = [];
  let list: { type: "ul" | "ol"; items: string[] } | null = null;
  const flushPara = () => {
    if (para.length) blocks.push({ type: "p", text: para.join(" ").trim() });
    para = [];
  };
  const flushList = () => {
    if (list) blocks.push(list);
    list = null;
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    const ul = /^\s*[-*]\s+(.*)$/.exec(line);
    const ol = /^\s*\d+\.\s+(.*)$/.exec(line);
    if (!line.trim()) {
      flushPara();
      flushList();
    } else if (h) {
      flushPara();
      flushList();
      blocks.push({ type: "h", level: h[1]!.length <= 2 ? 2 : 3, text: h[2]!.trim() });
    } else if (ul || ol) {
      flushPara();
      const type = ul ? "ul" : "ol";
      if (!list || list.type !== type) {
        flushList();
        list = { type, items: [] };
      }
      list.items.push((ul ?? ol)![1]!.trim());
    } else {
      flushList();
      para.push(line.trim());
    }
  }
  flushPara();
  flushList();
  return blocks;
}

/** **fett** und *kursiv* als React-Elemente, alles andere als Text. */
export function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|\*([^*]+)\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(m[1] !== undefined ? <strong key={i++}>{m[1]}</strong> : <em key={i++}>{m[2]}</em>);
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
