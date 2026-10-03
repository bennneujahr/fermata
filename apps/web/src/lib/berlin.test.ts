import { describe, expect, it } from "vitest";
import {
  addDays,
  berlinDateKey,
  berlinTimeKey,
  berlinToDate,
  daysBetween,
  formatClock,
  formatDateKeyShort,
  formatDeadline,
  formatDayLong,
  formatEveningTime,
  formatSlotShort,
  formatWhen,
  isoUtc,
  relativeDay,
} from "./berlin";

// Freitag, 9. Oktober 2026 (Sommerzeit, UTC+2)
const NOW = new Date("2026-10-05T08:00:00Z"); // Montag, 10 Uhr in Berlin

describe("Zeiten in Europe/Berlin", () => {
  it("rechnet Ortszeit in UTC um, auch über die Zeitumstellung", () => {
    expect(isoUtc(berlinToDate("2026-10-09", "19:30"))).toBe("2026-10-09T17:30:00Z");
    expect(isoUtc(berlinToDate("2026-11-06", "19:30"))).toBe("2026-11-06T18:30:00Z");
    expect(isoUtc(berlinToDate("2026-10-25", "18:00"))).toBe("2026-10-25T17:00:00Z"); // Tag der Umstellung
    expect(isoUtc(berlinToDate("2027-03-28", "18:00"))).toBe("2027-03-28T16:00:00Z");
  });
  it("liest Tag und Uhrzeit in Berlin", () => {
    expect(berlinDateKey("2026-10-09T22:30:00Z")).toBe("2026-10-10");
    expect(berlinTimeKey("2026-10-09T22:30:00Z")).toBe("00:30");
  });
  it("Uhrzeit ohne :00 bei vollen Stunden", () => {
    expect(formatClock("2026-10-09T17:00:00Z")).toBe("19 Uhr");
    expect(formatClock("2026-10-09T17:30:00Z")).toBe("19:30 Uhr");
  });
  it("Fristen wie im Gespräch", () => {
    expect(formatDeadline("2026-10-09T10:00:00Z", NOW)).toBe("bis Freitag, 12 Uhr");
    expect(formatDeadline("2026-10-05T16:30:00Z", NOW)).toBe("bis heute, 18:30 Uhr");
    expect(formatDeadline("2026-10-06T10:00:00Z", NOW)).toBe("bis morgen, 12 Uhr");
    expect(formatDeadline("2026-10-16T10:00:00Z", NOW)).toBe("bis Freitag, 16. Oktober, 12 Uhr");
  });
  it("relative Tage und Abendzeiten", () => {
    expect(relativeDay("2026-10-11T17:00:00Z", NOW)).toBe("Sonntag");
    expect(formatDayLong("2026-10-09T17:00:00Z", NOW)).toBe("Freitag, 9. Oktober");
    expect(formatDayLong("2027-01-08T17:00:00Z", NOW)).toBe("Freitag, 8. Januar 2027");
    expect(formatEveningTime("2026-10-09T17:30:00Z", NOW)).toBe("Freitag, 9. Oktober, 19:30 Uhr");
    expect(formatWhen("2026-10-05T17:00:00Z", NOW)).toBe("heute um 19 Uhr");
    expect(formatWhen("2026-10-09T17:00:00Z", NOW)).toBe("am Freitag, 9. Oktober, um 19 Uhr");
    expect(formatSlotShort("2026-10-09T17:30:00Z")).toBe("Fr., 9. Okt., 19:30 Uhr");
    expect(formatDateKeyShort("2026-10-12")).toBe("Mo., 12. Okt.");
  });
  it("Kalendertage", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-03-28", 2)).toBe("2026-03-30");
    expect(daysBetween("2026-10-05", "2026-10-18")).toBe(13);
  });
});
