import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PLACEHOLDER_QUESTIONS, isPlaceholder, placeholderQuestion } from "./placeholders";

const doc = readFileSync(fileURLToPath(new URL("../../../../../../docs/PLATZHALTER.md", import.meta.url)), "utf8");

function row(q: string): string {
  const line = doc.split("\n").find((l) => l.startsWith(`| ${q} |`));
  if (!line) throw new Error(`Frage ${q} fehlt in docs/PLATZHALTER.md`);
  return line;
}

describe("Platzhalter", () => {
  it("jede Zuordnung steht in der Zeile ihrer Frage in docs/PLATZHALTER.md", () => {
    for (const [key, q] of Object.entries(PLACEHOLDER_QUESTIONS)) {
      expect(row(q), `${key} → ${q}`).toContain(`\`${key}\``);
    }
  });
  it("die Frage aus der Beschreibung hat Vorrang", () => {
    expect(placeholderQuestion("matching.weights", "PLATZHALTER (Frage B9): …")).toBe("B9");
    expect(placeholderQuestion("matching.weights", "PLATZHALTER: Gewichte")).toBe("C5");
    expect(placeholderQuestion("x.y", "PLATZHALTER")).toBeNull();
  });
  it("erkennt Platzhalter unabhängig von der Schreibweise", () => {
    expect(isPlaceholder("PLATZHALTER: Wert")).toBe(true);
    expect(isPlaceholder("Platzhalter bis zur Entscheidung")).toBe(true);
    expect(isPlaceholder("Mindestscore")).toBe(false);
  });
});
