// Datum und Uhrzeit für Mitgliedschaft und Sicherheit, immer Europe/Berlin, deutsch.
// Ergänzt lib/format.ts um Wochentag, Sekunden (Eingangsbestätigungen) und Zeitzone.
const TZ = "Europe/Berlin";

function valid(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** „Samstag, 10. Oktober, 19:30 Uhr“ */
export function formatDayTime(iso: string | null | undefined): string {
  const d = valid(iso);
  if (!d) return "–";
  const day = new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "numeric", month: "long", timeZone: TZ }).format(d);
  return `${day}, ${formatTime(iso)} Uhr`;
}

/** „Sa., 10.10.2026“ */
export function formatShortDay(iso: string | null | undefined): string {
  const d = valid(iso);
  if (!d) return "–";
  return new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric", timeZone: TZ }).format(d);
}

/** „19:30“ */
export function formatTime(iso: string | null | undefined): string {
  const d = valid(iso);
  if (!d) return "–";
  return new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(d);
}

/** Zeitpunkt einer Erklärung mit Sekunden und Zeitzone: „03.10.2026, 14:03:12 Uhr (MESZ)“ */
export function formatReceipt(iso: string | null | undefined): string {
  const d = valid(iso);
  if (!d) return "–";
  const date = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: TZ }).format(d);
  const time = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: TZ }).format(d);
  const zone = new Intl.DateTimeFormat("de-DE", { timeZone: TZ, timeZoneName: "short" }).formatToParts(d).find((p) => p.type === "timeZoneName")?.value;
  return `${date}, ${time} Uhr${zone ? ` (${zone})` : ""}`;
}

/** Datum und Uhrzeit getrennt (für „Abgeschickt am … um … Uhr“). */
export function dateAndTime(iso: string): { date: string; time: string } {
  const d = valid(iso);
  if (!d) return { date: "–", time: "–" };
  return {
    date: new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: TZ }).format(d),
    time: new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: TZ }).format(d),
  };
}

/** Kurze Beschriftung eines Abends: „Sa., 10.10.2026, 19:30 · Café am See“ */
export function eveningLabel(startsAt: string | null | undefined, venue?: string | null): string {
  const when = startsAt ? `${formatShortDay(startsAt)}, ${formatTime(startsAt)}` : "";
  return [when, venue].filter(Boolean).join(" · ");
}
