// Formatierung für Mails und Seiten: Datum und Uhrzeit in Europe/Berlin, Beträge in Euro.
// Eingangsbestätigungen (§ 312k, § 356a BGB) nennen Datum und Uhrzeit mit Sekunden und Zeitzone.

const TZ = "Europe/Berlin";

function parts(date: Date, opts: Intl.DateTimeFormatOptions): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat("de-DE", { timeZone: TZ, ...opts }).formatToParts(date)) out[p.type] = p.value;
  return out;
}

function toDate(v: Date | string | number): Date {
  return v instanceof Date ? v : new Date(v);
}

/** „Freitag, 9. Oktober 2026“ */
export function formatDate(v: Date | string | number): string {
  const p = parts(toDate(v), { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return `${p.weekday}, ${p.day}. ${p.month} ${p.year}`;
}

/** „Freitag, 9. Oktober 2026, 19:30 Uhr“ */
export function formatDateTime(v: Date | string | number): string {
  const d = toDate(v);
  const t = parts(d, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  return `${formatDate(d)}, ${t.hour}:${t.minute} Uhr`;
}

/** Für Eingangsbestätigungen: „03.10.2026, 01:12:45 Uhr (MESZ)“ */
export function formatReceipt(v: Date | string | number): string {
  const p = parts(toDate(v), {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit",
    hourCycle: "h23", timeZoneName: "short",
  });
  return `${p.day}.${p.month}.${p.year}, ${p.hour}:${p.minute}:${p.second} Uhr (${p.timeZoneName})`;
}

/** „74,50 €“ */
export function formatEur(cents: number): string {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(cents / 100).replace(/ /g, " ");
}

export interface RenderedMail {
  subject: string;
  html: string;
  text: string;
  template: string;
  purpose: string;
}

export const LEGAL_DRAFT_NOTE = "Hinweis: Die rechtlichen Texte in dieser Mail sind ein ENTWURF und werden noch anwaltlich geprüft.";
