// Zeiten für Abende, Fristen und freie Abende – immer in Europe/Berlin, deutsch, ohne Bibliothek.
// Fristen lesen sich wie im Gespräch: „bis Freitag, 12 Uhr“, „bis heute, 18:30 Uhr“.
const TZ = "Europe/Berlin";

const WEEKDAYS = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"] as const;
const WEEKDAYS_SHORT = ["So.", "Mo.", "Di.", "Mi.", "Do.", "Fr.", "Sa."] as const;
const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"] as const;
const MONTHS_SHORT = ["Jan.", "Feb.", "März", "Apr.", "Mai", "Juni", "Juli", "Aug.", "Sept.", "Okt.", "Nov.", "Dez."] as const;

export interface BerlinParts {
  year: number;
  month: number; // 1–12
  day: number;
  hour: number;
  minute: number;
  weekday: number; // 0 = Sonntag
}

const partsFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  weekday: "short",
});
const WD: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function toDate(v: string | Date): Date {
  return v instanceof Date ? v : new Date(v);
}

export function berlinParts(v: string | Date): BerlinParts {
  const p: Record<string, string> = {};
  for (const part of partsFormat.formatToParts(toDate(v))) p[part.type] = part.value;
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour) % 24,
    minute: Number(p.minute),
    weekday: WD[p.weekday ?? "Sun"] ?? 0,
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Kalendertag in Berlin als „JJJJ-MM-TT“. */
export function berlinDateKey(v: string | Date): string {
  const p = berlinParts(v);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Uhrzeit in Berlin als „HH:MM“. */
export function berlinTimeKey(v: string | Date): string {
  const p = berlinParts(v);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/** Ortszeit Berlin (Tag „JJJJ-MM-TT“, Uhrzeit „HH:MM“) → Zeitpunkt (UTC), auch über die Zeitumstellung. */
export function berlinToDate(dateKey: string, time: string): Date {
  const [y, m, d] = dateKey.split("-").map(Number) as [number, number, number];
  const [hh, mm] = time.split(":").map(Number) as [number, number];
  const target = Date.UTC(y, m - 1, d, hh, mm);
  let t = target - 60 * 60 * 1000; // erste Schätzung: MEZ
  for (let i = 0; i < 3; i++) {
    const p = berlinParts(new Date(t));
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    const diff = asUtc - target;
    if (diff === 0) break;
    t -= diff;
  }
  return new Date(t);
}

/** ISO-Zeit in UTC ohne Millisekunden („2026-10-09T17:30:00Z“), wie die Datenbank sie liefert. */
export function isoUtc(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** Tag „JJJJ-MM-TT“ plus n Tage (Kalendertage, ohne Zeitzone). */
export function addDays(dateKey: string, n: number): string {
  const [y, m, d] = dateKey.split("-").map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d + n, 12));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/** Tage zwischen zwei Kalendertagen (b − a). */
export function daysBetween(a: string, b: string): number {
  const [ya, ma, da] = a.split("-").map(Number) as [number, number, number];
  const [yb, mb, db] = b.split("-").map(Number) as [number, number, number];
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86_400_000);
}

export function weekdayOfKey(dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
}

/** „19 Uhr“ oder „19:30 Uhr“. */
export function formatClock(v: string | Date): string {
  const p = berlinParts(v);
  return p.minute === 0 ? `${p.hour} Uhr` : `${p.hour}:${pad(p.minute)} Uhr`;
}

/** „Freitag, 9. Oktober“ (mit Jahr, wenn es nicht das Jahr von now ist). */
export function formatDayLong(v: string | Date, now: string | Date = new Date()): string {
  const p = berlinParts(v);
  const year = p.year !== berlinParts(now).year ? ` ${p.year}` : "";
  return `${WEEKDAYS[p.weekday]}, ${p.day}. ${MONTHS[p.month - 1]}${year}`;
}

/** Tag „JJJJ-MM-TT“ als „Freitag, 9. Oktober“. */
export function formatDateKeyLong(dateKey: string): string {
  const [, m, d] = dateKey.split("-").map(Number) as [number, number, number];
  return `${WEEKDAYS[weekdayOfKey(dateKey)]}, ${d}. ${MONTHS[m - 1]}`;
}

/** Tag „JJJJ-MM-TT“ kurz: „Fr., 9. Okt.“ */
export function formatDateKeyShort(dateKey: string): string {
  const [, m, d] = dateKey.split("-").map(Number) as [number, number, number];
  return `${WEEKDAYS_SHORT[weekdayOfKey(dateKey)]}, ${d}. ${MONTHS_SHORT[m - 1]}`;
}

/** „Fr., 9. Okt., 19:30 Uhr“ – für Knöpfe und Listen. */
export function formatSlotShort(v: string | Date): string {
  const p = berlinParts(v);
  return `${WEEKDAYS_SHORT[p.weekday]}, ${p.day}. ${MONTHS_SHORT[p.month - 1]}, ${formatClock(v)}`;
}

/** „Freitag, 9. Oktober, 19:30 Uhr“. */
export function formatEveningTime(v: string | Date, now: string | Date = new Date()): string {
  return `${formatDayLong(v, now)}, ${formatClock(v)}`;
}

/**
 * Tag relativ zu now: „heute“, „morgen“, ein Wochentag (bis 6 Tage voraus) oder „Freitag, 16. Oktober“.
 * Für Fristen und Erinnerungen.
 */
export function relativeDay(v: string | Date, now: string | Date = new Date()): string {
  const diff = daysBetween(berlinDateKey(now), berlinDateKey(v));
  if (diff === 0) return "heute";
  if (diff === 1) return "morgen";
  if (diff > 1 && diff <= 6) return WEEKDAYS[berlinParts(v).weekday] ?? "";
  return formatDayLong(v, now);
}

/** „Freitag, 12 Uhr“, „heute, 18:30 Uhr“ (relativ zu now). */
export function formatRelative(v: string | Date, now: string | Date = new Date()): string {
  return `${relativeDay(v, now)}, ${formatClock(v)}`;
}

/** Frist: „bis Freitag, 12 Uhr“, „bis heute, 18:30 Uhr“. */
export function formatDeadline(v: string | Date, now: string | Date = new Date()): string {
  return `bis ${formatRelative(v, now)}`;
}

/** „heute um 19:30 Uhr“, „am Freitag, 9. Oktober, um 19 Uhr“. */
export function formatWhen(v: string | Date, now: string | Date = new Date()): string {
  const rel = relativeDay(v, now);
  if (rel === "heute" || rel === "morgen") return `${rel} um ${formatClock(v)}`;
  return `am ${formatDayLong(v, now)}, um ${formatClock(v)}`;
}

/** Ist v schon vorbei? */
export function isPast(v: string | Date, now: string | Date = new Date()): boolean {
  return toDate(v).getTime() <= toDate(now).getTime();
}

/** Restzeit in Minuten (abgerundet, nie negativ). */
export function minutesUntil(v: string | Date, now: string | Date = new Date()): number {
  return Math.max(0, Math.floor((toDate(v).getTime() - toDate(now).getTime()) / 60_000));
}
