import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Markdown, parseMarkdown } from "./markdown";

describe("Markdown der Rechtstexte", () => {
  it("liest Überschriften, Absätze und Listen", () => {
    expect(parseMarkdown("## Titel\n\nZeile eins\nZeile zwei\n\n- a\n- b\n\n1. x\n2. y")).toEqual([
      { type: "h", level: 2, text: "Titel" },
      { type: "p", text: "Zeile eins Zeile zwei" },
      { type: "ul", items: ["a", "b"] },
      { type: "ol", items: ["x", "y"] },
    ]);
  });
  it("gibt kein HTML durch", () => {
    const html = renderToStaticMarkup(<Markdown source={'<script>alert(1)</script> **fett** und *kursiv*'} />);
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("<strong>fett</strong>");
    expect(html).toContain("<em>kursiv</em>");
  });
});
