// Datum und Uhrzeit für Mails und Push, immer in Europe/Berlin.
const TZ = "Europe/Berlin";

const dayFmt = new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "numeric", month: "long", timeZone: TZ });
const shortDayFmt = new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "numeric", month: "short", timeZone: TZ });
const timeFmt = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: TZ });

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

/** „Freitag, 9. Oktober“ */
export function formatDay(value: string | Date): string {
  return dayFmt.format(toDate(value));
}

/** „19:30 Uhr“ */
export function formatTime(value: string | Date): string {
  return `${timeFmt.format(toDate(value))} Uhr`;
}

/** „Freitag, 9. Oktober, 19:30 Uhr“ */
export function formatDayTime(value: string | Date): string {
  return `${formatDay(value)}, ${formatTime(value)}`;
}

/** „Fr., 9. Okt., 19:30 Uhr“ (kurz, für Push) */
export function formatShortDayTime(value: string | Date): string {
  return `${shortDayFmt.format(toDate(value))}, ${formatTime(value)}`;
}

/** Kalendertag „2026-10-14“ → „Mittwoch, 14. Oktober“ */
export function formatDateOnly(isoDate: string): string {
  return formatDay(new Date(`${isoDate}T12:00:00Z`));
}

/** Datum der Ortszeit als „2026-10-14“ (für Vergleiche „heute/morgen“) */
export function berlinDate(value: string | Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(toDate(value));
}
