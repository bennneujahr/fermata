// Kleine Regeln der Anzeige (ohne Server-Abhängigkeit, damit sie im Unit-Test laufen).
// Die verbindlichen Regeln entscheidet die Datenbank; hier geht es nur darum, was die Oberfläche anbietet.
import type { BillingOverview } from "@/lib/billing-types";

/** Läuft eine Mitgliedschaft, bei der eine neue Bestellung nicht möglich ist? (wie billing.order_precheck) */
export function hasRunningMembership(o: BillingOverview, now = Date.now()): boolean {
  if (o.status === "active" || o.status === "past_due") return true;
  if (o.status === "cancelled") return !o.cancel_at || new Date(o.cancel_at).getTime() > now;
  return false;
}

/** Datum der nächsten Abbuchung (nur bei laufender, ungekündigter Mitgliedschaft). */
export function nextBillingDate(o: BillingOverview): string | null {
  if (o.status !== "active" || !o.current_period) return null;
  return o.current_period.extended_until ?? o.current_period.ends_at;
}
