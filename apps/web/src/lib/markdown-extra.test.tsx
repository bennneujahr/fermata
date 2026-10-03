import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Markdown, parseMarkdown, safeHref } from "./markdown";

describe("Markdown der Rechtstexte: Zitat, Tabelle, Links", () => {
  it("liest Zitate, Trennlinien, Tabellen und tiefere Überschriften", () => {
    expect(parseMarkdown("> **ENTWURF** – nicht verbindlich\n> zweite Zeile\n\n---\n\n#### Klein\n\n| Stufe | Preis |\n|---|---|\n| Auftakt | 49,00 € |")).toEqual([
      { type: "quote", text: "**ENTWURF** – nicht verbindlich zweite Zeile" },
      { type: "hr" },
      { type: "h", level: 4, text: "Klein" },
      { type: "table", head: ["Stufe", "Preis"], rows: [["Auftakt", "49,00 €"]] },
    ]);
  });
  it("erlaubt nur sichere Link-Ziele", () => {
    expect(safeHref("https://fermata.example/x")).toBe("https://fermata.example/x");
    expect(safeHref("/rechtliches/agb")).toBe("/rechtliches/agb");
    expect(safeHref("mailto:hallo@fermata.example")).toBe("mailto:hallo@fermata.example");
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("//evil.example")).toBeNull();
    expect(safeHref("data:text/html,<b>")).toBeNull();
  });
  it("rendert Links sicher und kein HTML", () => {
    const html = renderToStaticMarkup(
      <Markdown source={"[AGB](/rechtliches/agb) [böse](javascript:alert(1)) <img src=x onerror=alert(1)> `code`\n\n| A |\n|---|\n| <b>x</b> |"} />,
    );
    expect(html).toContain('<a href="/rechtliches/agb">AGB</a>');
    expect(html).not.toContain("javascript:");
    expect(html).toContain("böse");
    expect(html).toContain("&lt;img");
    expect(html).toContain("<code>code</code>");
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(html).toContain('<table class="table">');
  });
});
