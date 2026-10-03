// Beträge mit Cent („74,50 €“) für Bestellung, Widerruf und Erstattung. lib/format.formatEuro rundet auf ganze Euro.
export function formatCents(cents: number | null | undefined): string {
  const n = typeof cents === "number" && Number.isFinite(cents) ? cents : 0;
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n / 100);
}
