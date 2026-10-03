import { describe, expect, it } from "vitest";
import { serviceOrigins } from "./csp";
import { isMemberPath } from "./routes";
import { isUpcoming, offeredTimes, toggleTime } from "./evening-types";

describe("Abende", () => {
  it("angebotene Uhrzeiten je Zustand", () => {
    const d = { requested_times: ["a"], countered_times: ["b"] };
    expect(offeredTimes({ ...d, state: "time_requested" })).toEqual(["a"]);
    expect(offeredTimes({ ...d, state: "time_countered" })).toEqual(["b"]);
    expect(offeredTimes({ ...d, state: "proposed" })).toEqual([]);
  });
  it("kommend oder vergangen", () => {
    const now = new Date("2026-10-10T12:00:00Z");
    expect(isUpcoming({ state: "proposed", starts_at: null, ends_at: null }, now)).toBe(true);
    expect(isUpcoming({ state: "confirmed", starts_at: "2026-10-09T17:00:00Z", ends_at: "2026-10-09T19:00:00Z" }, now)).toBe(false);
    expect(isUpcoming({ state: "confirmed", starts_at: "2026-10-10T17:00:00Z", ends_at: "2026-10-10T19:00:00Z" }, now)).toBe(true);
    expect(isUpcoming({ state: "declined", starts_at: null, ends_at: null }, now)).toBe(false);
  });
  it("höchstens drei Uhrzeiten", () => {
    let l: string[] = [];
    for (const t of ["c", "a", "b", "d"]) l = toggleTime(l, t, 3);
    expect(l).toEqual(["a", "b", "c"]);
    expect(toggleTime(l, "b", 3)).toEqual(["a", "c"]);
  });
});

describe("Wege", () => {
  it("freie Abende gehören zum Mitgliederbereich", () => {
    expect(isMemberPath("/zeiten")).toBe(true);
    expect(isMemberPath("/zeiten/abc")).toBe(true);
    expect(isMemberPath("/zeitenx")).toBe(false);
  });
});

describe("CSP für LiveKit und den Textdienst", () => {
  it("nimmt Adresse und Gegenstück", () => {
    expect(serviceOrigins("wss://livekit.fermata.example/rtc")).toEqual(["wss://livekit.fermata.example", "https://livekit.fermata.example"]);
    expect(serviceOrigins("https://viola.fermata.example/v1")).toEqual(["https://viola.fermata.example", "wss://viola.fermata.example"]);
    expect(serviceOrigins(undefined)).toEqual([]);
    expect(serviceOrigins("kein url")).toEqual([]);
  });
});
