// Raster für „Freie Abende“: je Tag die Abendstunden in 30-Minuten-Schritten (Ortszeit Berlin).
// Aufeinanderfolgende Felder eines Tages ergeben ein Zeitfenster für api.set_availability.
import { addDays, berlinDateKey, berlinToDate, daysBetween, isoUtc } from "./berlin";

export const GRID_FROM = "17:00";
export const GRID_TO = "23:00";
export const STEP_MINUTES = 30;

function toMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number) as [number, number];
  return h * 60 + m;
}

function fromMinutes(n: number): string {
  return `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
}

/** Beginn der Felder: 17:00, 17:30, … 22:30. */
export const SLOT_TIMES: readonly string[] = (() => {
  const out: string[] = [];
  for (let m = toMinutes(GRID_FROM); m < toMinutes(GRID_TO); m += STEP_MINUTES) out.push(fromMinutes(m));
  return out;
})();

export function slotEnd(time: string): string {
  return fromMinutes(toMinutes(time) + STEP_MINUTES);
}

export function cellKey(dateKey: string, time: string): string {
  return `${dateKey}|${time}`;
}

export function parseCellKey(key: string): { date: string; time: string } {
  const [date, time] = key.split("|") as [string, string];
  return { date, time };
}

/** Alle Tage eines Zeitraums (einschließlich Anfang und Ende). */
export function periodDays(startsOn: string, endsOn: string): string[] {
  const n = daysBetween(startsOn, endsOn);
  const out: string[] = [];
  for (let i = 0; i <= n; i++) out.push(addDays(startsOn, i));
  return out;
}

/** Tage in Wochen (Montag bis Sonntag) aufteilen, damit das Raster wie ein Kalender liest. */
export function weeksOf(days: string[], weekdayOf: (d: string) => number): string[][] {
  const weeks: string[][] = [];
  let current: string[] = [];
  for (const d of days) {
    if (current.length && weekdayOf(d) === 1) {
      weeks.push(current);
      current = [];
    }
    current.push(d);
  }
  if (current.length) weeks.push(current);
  return weeks;
}

/** Alle sieben Tage (Montag bis Sonntag) der Woche, in der eine Teilwoche liegt – für ein gleichmäßiges Raster. */
export function weekColumns(week: string[], weekdayOf: (d: string) => number): string[] {
  if (!week.length) return [];
  const monday = addDays(week[0]!, -((weekdayOf(week[0]!) + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

export interface WindowIn {
  starts_at: string;
  ends_at: string;
}

/** Fenster aus der Datenbank → markierte Felder (nur Felder, die ganz im Fenster liegen). */
export function windowsToCells(windows: WindowIn[]): Set<string> {
  const out = new Set<string>();
  for (const w of windows) {
    const s = new Date(w.starts_at).getTime();
    const e = new Date(w.ends_at).getTime();
    const day = berlinDateKey(w.starts_at);
    for (const t of SLOT_TIMES) {
      const cs = berlinToDate(day, t).getTime();
      const ce = cs + STEP_MINUTES * 60_000;
      if (cs >= s && ce <= e) out.add(cellKey(day, t));
    }
  }
  return out;
}

/** Fenster, die nicht ganz ins Raster passen (z. B. vor 17 Uhr oder nicht im 30-Minuten-Takt). */
export function windowsOutsideGrid(windows: WindowIn[]): WindowIn[] {
  return windows.filter((w) => {
    const minutes = (new Date(w.ends_at).getTime() - new Date(w.starts_at).getTime()) / 60_000;
    return windowsToCells([w]).size * STEP_MINUTES < minutes;
  });
}

export interface WindowOut {
  date: string;
  from: string;
  to: string;
  starts_at: string;
  ends_at: string;
  minutes: number;
}

/** Markierte Felder → Fenster (zusammenhängende Felder eines Tages), sortiert. */
export function cellsToWindows(cells: Iterable<string>, days: string[]): WindowOut[] {
  const set = new Set(cells);
  const out: WindowOut[] = [];
  for (const day of days) {
    let start: string | null = null;
    let prev: string | null = null;
    const flush = () => {
      if (start && prev) {
        const to = slotEnd(prev);
        out.push({
          date: day,
          from: start,
          to,
          starts_at: isoUtc(berlinToDate(day, start)),
          ends_at: isoUtc(berlinToDate(day, to)),
          minutes: toMinutes(to) - toMinutes(start),
        });
      }
      start = null;
      prev = null;
    };
    for (const t of SLOT_TIMES) {
      if (set.has(cellKey(day, t))) {
        if (!start) start = t;
        prev = t;
      } else flush();
    }
    flush();
  }
  return out;
}

export interface GridRules {
  minWindowMinutes: number;
  maxWindowHours: number;
  maxWindows: number;
}

export const DEFAULT_RULES: GridRules = { minWindowMinutes: 120, maxWindowHours: 6, maxWindows: 12 };

export type WindowIssue = { kind: "too_short" | "too_long"; window: WindowOut } | { kind: "too_many"; count: number };

/** Prüft die Fenster vor dem Speichern (dieselben Regeln wie api.set_availability). */
export function checkWindows(windows: WindowOut[], rules: GridRules = DEFAULT_RULES): WindowIssue[] {
  const issues: WindowIssue[] = [];
  for (const w of windows) {
    if (w.minutes < rules.minWindowMinutes) issues.push({ kind: "too_short", window: w });
    else if (w.minutes > rules.maxWindowHours * 60) issues.push({ kind: "too_long", window: w });
  }
  if (windows.length > rules.maxWindows) issues.push({ kind: "too_many", count: windows.length });
  return issues;
}

/** Ist ein Feld schon vorbei (Beginn ≤ now)? */
export function cellInPast(dateKey: string, time: string, now: Date): boolean {
  return berlinToDate(dateKey, time).getTime() <= now.getTime();
}

/** Felder von „von“ bis „bis“ (einschließlich) eines Tages, z. B. für Ziehen oder Umschalt-Klick. */
export function cellRange(dateKey: string, a: string, b: string): string[] {
  const [lo, hi] = toMinutes(a) <= toMinutes(b) ? [a, b] : [b, a];
  return SLOT_TIMES.filter((t) => toMinutes(t) >= toMinutes(lo) && toMinutes(t) <= toMinutes(hi)).map((t) => cellKey(dateKey, t));
}
