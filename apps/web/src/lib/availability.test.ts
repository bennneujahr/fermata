import { describe, expect, it } from "vitest";
import { cellInPast, cellKey, cellRange, cellsToWindows, checkWindows, periodDays, SLOT_TIMES, weeksOf, windowsOutsideGrid, windowsToCells } from "./availability";
import { weekdayOfKey } from "./berlin";

describe("Raster für freie Abende", () => {
  it("hat 12 halbe Stunden von 17 bis 23 Uhr", () => {
    expect(SLOT_TIMES).toHaveLength(12);
    expect(SLOT_TIMES[0]).toBe("17:00");
    expect(SLOT_TIMES.at(-1)).toBe("22:30");
  });
  it("Zeitraum in Tage und Wochen (Montag bis Sonntag)", () => {
    const days = periodDays("2026-10-08", "2026-10-21");
    expect(days).toHaveLength(14);
    const weeks = weeksOf(days, weekdayOfKey);
    expect(weeks.map((w) => w.length)).toEqual([4, 7, 3]);
    expect(weeks[1]![0]).toBe("2026-10-12");
  });
  it("zusammenhängende Felder werden ein Fenster (UTC)", () => {
    const cells = [...cellRange("2026-10-09", "18:00", "20:30"), cellKey("2026-10-09", "22:00"), cellKey("2026-10-10", "17:00")];
    const w = cellsToWindows(cells, ["2026-10-09", "2026-10-10"]);
    expect(w).toEqual([
      { date: "2026-10-09", from: "18:00", to: "21:00", starts_at: "2026-10-09T16:00:00Z", ends_at: "2026-10-09T19:00:00Z", minutes: 180 },
      { date: "2026-10-09", from: "22:00", to: "22:30", starts_at: "2026-10-09T20:00:00Z", ends_at: "2026-10-09T20:30:00Z", minutes: 30 },
      { date: "2026-10-10", from: "17:00", to: "17:30", starts_at: "2026-10-10T15:00:00Z", ends_at: "2026-10-10T15:30:00Z", minutes: 30 },
    ]);
    const issues = checkWindows(w);
    expect(issues.filter((i) => i.kind === "too_short")).toHaveLength(2);
  });
  it("Fenster aus der Datenbank zurück ins Raster (Hin- und Rückweg)", () => {
    const windows = [{ starts_at: "2026-10-09T16:00:00Z", ends_at: "2026-10-09T21:00:00Z" }];
    const cells = windowsToCells(windows);
    expect(cells.size).toBe(10);
    const back = cellsToWindows(cells, ["2026-10-09"]);
    expect(back[0]).toMatchObject({ starts_at: windows[0]!.starts_at, ends_at: windows[0]!.ends_at });
    expect(windowsOutsideGrid(windows)).toEqual([]);
    expect(windowsOutsideGrid([{ starts_at: "2026-10-09T14:00:00Z", ends_at: "2026-10-09T18:00:00Z" }])).toHaveLength(1);
  });
  it("zu viele Fenster", () => {
    const days = periodDays("2026-10-05", "2026-10-18");
    const cells = days.flatMap((d) => cellRange(d, "18:00", "19:30"));
    const issues = checkWindows(cellsToWindows(cells, days));
    expect(issues).toContainEqual({ kind: "too_many", count: 14 });
  });
  it("vergangene Felder", () => {
    const now = new Date("2026-10-09T17:10:00Z"); // 19:10 Uhr
    expect(cellInPast("2026-10-09", "19:00", now)).toBe(true);
    expect(cellInPast("2026-10-09", "19:30", now)).toBe(false);
  });
});
