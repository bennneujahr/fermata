import { describe, expect, it } from "vitest";
import { formatDate, formatEuro, telHref } from "./format";

describe("Formatierung", () => {
  it("Datum deutsch", () => {
    expect(formatDate("1990-05-17")).toBe("17. Mai 1990");
    expect(formatDate(null)).toBe("–");
  });
  it("Euro ohne Cent", () => {
    expect(formatEuro(4900)).toMatch(/^49\s€$/);
  });
  it("Telefon-Link", () => {
    expect(telHref("030 12074182")).toBe("tel:03012074182");
    expect(telHref("110")).toBe("tel:110");
  });
});
