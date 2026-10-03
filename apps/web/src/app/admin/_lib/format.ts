// Zahlen und Zeiten für den Admin-Bereich (de-DE, Europe/Berlin). Ohne server-only: auch in Client-Komponenten nutzbar.
import { adminCommon as c } from "@/copy/admin-common";

const TZ = "Europe/Berlin";

export function num(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined || Number.isNaN(n)) return c.none;
  return new Intl.NumberFormat("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
}

/** Zahl mit k-Unterdrückung: null → „< k“. */
export function kNum(n: number | null | undefined, k: number): string {
  if (n === null || n === undefined) return c.kLess(k);
  return num(n);
}

export function pct(share: number | null | undefined, digits = 0): string {
  if (share === null || share === undefined || Number.isNaN(share)) return c.none;
  return new Intl.NumberFormat("de-DE", { style: "percent", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(share);
}

export function euro(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return c.none;
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Number(n));
}

export function usd(n: number | null | undefined, digits = 4): string {
  if (n === null || n === undefined) return c.none;
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: digits }).format(n);
}

export function score(n: number | null | undefined): string {
  return num(n === null || n === undefined ? null : Number(n), 2);
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return c.none;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return c.none;
  return new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(d);
}

export function dateShort(iso: string | null | undefined): string {
  if (!iso) return c.none;
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00Z`) : new Date(iso);
  if (Number.isNaN(d.getTime())) return c.none;
  return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: TZ }).format(d);
}

export function dayMonth(iso: string): string {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00Z`) : new Date(iso);
  return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", timeZone: TZ }).format(d);
}

/** Dauer in Worten (gerundet): „3 Std.“, „45 Min.“, „2 Tagen“. */
export function duration(ms: number): string {
  const min = Math.max(0, Math.round(Math.abs(ms) / 60000));
  if (min < 60) return c.minutes(min);
  const h = Math.round(min / 60);
  if (h < 48) return c.hours(h);
  return c.days(Math.round(h / 24));
}

export interface Due {
  label: string;
  overdue: boolean;
  soon: boolean;
}

/** Frist relativ zu jetzt: überfällig (rot), bald fällig (unter 4 Stunden), sonst normal. */
export function due(iso: string | null | undefined, now: number): Due | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const diff = t - now;
  if (diff < 0) return { label: c.overdueSince(duration(diff)), overdue: true, soon: false };
  return { label: c.dueIn(duration(diff)), overdue: false, soon: diff < 4 * 3600 * 1000 };
}

/** Datum für <input type="date"> und <input type="datetime-local"> in Europe/Berlin. */
export function isoDateBerlin(d: Date): string {
  const p = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: TZ }).formatToParts(d);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Ortszeit Europe/Berlin (aus datetime-local) → ISO mit Versatz. */
export function berlinLocalToIso(local: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number) as unknown as number[];
  // Versatz für diesen Zeitpunkt bestimmen (Sommer-/Winterzeit).
  const guess = Date.UTC(y!, mo! - 1, d!, h!, mi!);
  const offsetMin = (t: number) => {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(t));
    const g = (k: string) => Number(parts.find((x) => x.type === k)?.value);
    const asUtc = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"));
    return (asUtc - t) / 60000;
  };
  const off = offsetMin(guess - offsetMin(guess) * 60000);
  return new Date(guess - off * 60000).toISOString();
}

export function labelOf(map: Record<string, string>, key: string | null | undefined): string {
  if (!key) return c.none;
  return map[key] ?? key.replace(/_/g, " ");
}
