import { describe, expect, it } from "vitest";
import { berlinLocalToIso, due, kNum, pct } from "./format";
import { hasWarnings, pairingWarnings } from "./pairing";

describe("Admin-Formate", () => {
  it("unterdrückt kleine Zahlen", () => {
    expect(kNum(null, 5)).toBe("< 5");
    expect(kNum(12, 5)).toBe("12");
    expect(kNum(0, 5)).toBe("0");
  });
  it("Anteile", () => {
    expect(pct(0.167, 0)).toMatch(/17\s?%/);
  });
  it("Fristen: überfällig und bald fällig", () => {
    const now = Date.parse("2026-10-03T12:00:00Z");
    expect(due("2026-10-03T10:00:00Z", now)).toMatchObject({ overdue: true, label: "überfällig seit 2 Std." });
    expect(due("2026-10-03T14:00:00Z", now)).toMatchObject({ overdue: false, soon: true, label: "fällig in 2 Std." });
    expect(due("2026-10-05T12:00:00Z", now)).toMatchObject({ overdue: false, soon: false, label: "fällig in 2 Tagen" });
    expect(due(null, now)).toBeNull();
  });
  it("Ortszeit Berlin → UTC (Sommer- und Winterzeit)", () => {
    expect(berlinLocalToIso("2026-10-10T19:30")).toBe("2026-10-10T17:30:00.000Z");
    expect(berlinLocalToIso("2026-11-10T19:30")).toBe("2026-11-10T18:30:00.000Z");
    expect(berlinLocalToIso("kaputt")).toBeNull();
  });
});

describe("Warnungen eines Vorschlags", () => {
  const clean = { review_notes: { hinweise: [], empfehlung: "freigeben", ersatztext_verwendet: false, art9_filter: { ok: true, treffer: [] }, agent: { art9_verdacht: false } }, llm_score: 0.7, venue_id: "v" };
  it("ohne Warnung", () => {
    expect(hasWarnings(clean)).toBe(false);
  });
  it("Hinweise, Empfehlung, Ersatztext, Filter, fehlendes LLM", () => {
    expect(pairingWarnings({ ...clean, review_notes: { ...clean.review_notes, hinweise: ["Anfahrt ungleich"] } })).toEqual(["hinweise"]);
    expect(pairingWarnings({ ...clean, review_notes: { ...clean.review_notes, empfehlung: "genauer_pruefen" } })).toEqual(["empfehlung"]);
    expect(pairingWarnings({ ...clean, review_notes: { ...clean.review_notes, ersatztext_verwendet: true, art9_filter: { ok: false, treffer: ["religion"] } } })).toEqual(["ersatztext", "art9_filter"]);
    expect(pairingWarnings({ ...clean, llm_score: null })).toEqual(["ohne_llm"]);
  });
});
