// Datum und Zeit immer in Europe/Berlin, deutsch.
const TZ = "Europe/Berlin";

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "–";
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00Z`) : new Date(iso);
  if (Number.isNaN(d.getTime())) return "–";
  return new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "long", year: "numeric", timeZone: TZ }).format(d);
}

export function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return "–";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "–";
  return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: TZ }).format(d);
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "–";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "–";
  return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(d);
}

export function formatEuro(cents: number): string {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(cents / 100);
}

/** tel:-Link aus einer Nummer wie „030 12074182“. */
export function telHref(number: string): string {
  const digits = number.replace(/[^\d+]/g, "");
  return `tel:${digits}`;
}
