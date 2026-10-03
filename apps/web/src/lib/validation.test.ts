import { describe, expect, it } from "vitest";
import { ageOn, berlinToday, cleanName, isEmail, normalizeOtp, validateFacts } from "./validation";

describe("Alter und Datum", () => {
  it("rechnet volle Jahre, Geburtstag zählt ab dem Tag", () => {
    expect(ageOn("2008-10-03", "2026-10-03")).toBe(18);
    expect(ageOn("2008-10-04", "2026-10-03")).toBe(17);
    expect(ageOn("2008-02-29", "2026-02-28")).toBe(17);
    expect(ageOn("2008-02-29", "2026-03-01")).toBe(18);
  });
  it("Datum in Europe/Berlin (Mitternacht UTC ist schon der nächste Tag)", () => {
    expect(berlinToday(new Date("2026-10-02T22:30:00Z"))).toBe("2026-10-03");
    expect(berlinToday(new Date("2026-01-01T22:59:00Z"))).toBe("2026-01-01");
  });
});

describe("E-Mail, Code, Name", () => {
  it("prüft E-Mail-Adressen", () => {
    expect(isEmail(" Anna@Example.de ")).toBe(true);
    expect(isEmail("anna@")).toBe(false);
    expect(isEmail("a b@example.de")).toBe(false);
  });
  it("Code mit Leerzeichen oder Bindestrich", () => {
    expect(normalizeOtp("123 456")).toBe("123456");
    expect(normalizeOtp("123-456")).toBe("123456");
  });
  it("Name ohne doppelte Leerzeichen", () => {
    expect(cleanName("  Anna   Maria ")).toBe("Anna Maria");
  });
});

describe("Formular Angaben", () => {
  const ok = { first_name: "Anna", last_name: "Albers", birth_date: "1990-05-17", postal_code: "19053", city: "Schwerin", phone: "" };
  it("gültige Angaben", () => {
    expect(validateFacts(ok, "2026-10-03").errors).toEqual({});
  });
  it("18+ mit festem Stichtag", () => {
    expect(validateFacts({ ...ok, birth_date: "2008-10-04" }, "2026-10-03").errors).toEqual({ birth_date: "too_young" });
    expect(validateFacts({ ...ok, birth_date: "2008-10-03" }, "2026-10-03").errors).toEqual({});
  });
  it("Fehlerschlüssel für die Texte", () => {
    const r = validateFacts({ ...ok, first_name: "Anna3", postal_code: "1905", phone: "abc", birth_date: "" }, "2026-10-03");
    expect(r.errors).toMatchObject({ first_name: "invalid_name", postal_code: "invalid_postal_code", phone: "invalid_phone", birth_date: "invalid_birth_date" });
    expect(validateFacts({ ...ok, last_name: "  " }, "2026-10-03").errors).toEqual({ last_name: "required" });
    expect(validateFacts({ ...ok, birth_date: "2030-01-01" }, "2026-10-03").errors).toEqual({ birth_date: "invalid_birth_date" });
  });
});
