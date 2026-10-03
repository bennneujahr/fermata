// Kleine Regeln der Sicherheits-Oberfläche (ohne Server-Abhängigkeit, damit sie im Unit-Test laufen).
import type { HelpContacts, MyEvening, ReportCategory, TrustShare, VenueReservation } from "@/lib/safety-types";
import { ZERO_TOLERANCE } from "@/lib/safety-types";

export function digitsForTel(number: string): string {
  return number.replace(/[^\d+]/g, "");
}

/** Ersatz, falls api.help_contacts() nicht erreichbar ist: 110 und 112 sind gesetzlich fest, Heimwegtelefon aus den Einstellungen. */
export function fallbackHelpContacts(police?: string, heimweg?: string, heimwegHours?: string): HelpContacts {
  const p = police || "110";
  return {
    police: { name: "Polizei", number: p, tel: digitsForTel(p), hours: "rund um die Uhr" },
    emergency: { name: "Notruf (Rettungsdienst, Feuerwehr)", number: "112", tel: "112", hours: "rund um die Uhr" },
    heimwegtelefon: heimweg ? { name: "Heimwegtelefon", number: heimweg, tel: digitsForTel(heimweg), hours: heimwegHours ?? null } : null,
    telefonseelsorge: null,
    hilfetelefon_gewalt: null,
  };
}

export function isZeroTolerance(c: ReportCategory | string | null | undefined): boolean {
  return !!c && (ZERO_TOLERANCE as string[]).includes(c);
}

/**
 * Adresse, die die Vertrauensperson bekommt. Der Schlüssel steht im Fragment (#t=…): Browser schicken ihn nie an
 * einen Server, er landet also in keinem Protokoll. Liefert die Datenbank schon eine Adresse mit #t=, gilt diese.
 */
export function trustShareLink(origin: string, token: string, url?: string | null): string {
  if (url && /#t=/.test(url)) return url;
  return `${origin.replace(/\/$/, "")}/teilen#t=${encodeURIComponent(token)}`;
}

/** Schlüssel aus dem Fragment (#t=…) oder – für ältere Links – aus ?t=…. */
export function tokenFromLocation(hash: string, search = ""): string | null {
  const fromHash = new URLSearchParams(hash.replace(/^#/, "")).get("t");
  const fromQuery = new URLSearchParams(search.replace(/^\?/, "")).get("t");
  const t = (fromHash ?? fromQuery ?? "").trim();
  return t && /^[A-Za-z0-9_.=-]{8,256}$/.test(t) ? t : null;
}

/** Abende, die man teilen kann: bestätigt, mit Zeit, nicht länger als 24 Stunden vorbei. */
export function shareableEvenings(evenings: MyEvening[], now = Date.now(), hours = 24): MyEvening[] {
  return evenings
    .filter((e) => e.state === "confirmed" && e.starts_at && new Date(e.starts_at).getTime() + hours * 3_600_000 > now)
    .sort((a, b) => new Date(a.starts_at!).getTime() - new Date(b.starts_at!).getTime());
}

export function activeShares(shares: TrustShare[], eveningId: string): TrustShare[] {
  return shares.filter((s) => s.evening_id === eveningId && s.active);
}

/** Abende, zu denen man etwas melden kann (alle eigenen Abende mit Gegenüber). */
export function reportableEvenings(evenings: MyEvening[]): MyEvening[] {
  return evenings.filter((e) => e.counterpart_first_name || e.starts_at);
}

/**
 * Reservierung aus der JSON-Antwort von venue-confirm lesen. Vertrag mit der Härtung: die Felder von
 * ops.venue_reservation_summary (venue_name, starts_at, table_code, reservation_name, persons, status,
 * venue_confirmed_at), direkt oder unter „reservation“ bzw. „summary“.
 */
export function asReservation(body: unknown): VenueReservation | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const inner = (b.reservation ?? b.summary ?? b) as unknown;
  if (!inner || typeof inner !== "object") return null;
  const r = inner as Record<string, unknown>;
  if (!("table_code" in r || "venue_name" in r || "starts_at" in r)) return null;
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  return {
    venue_name: str(r.venue_name),
    starts_at: str(r.starts_at),
    table_code: str(r.table_code),
    reservation_name: str(r.reservation_name),
    persons: typeof r.persons === "number" ? r.persons : null,
    status: str(r.status),
    venue_confirmed_at: str(r.venue_confirmed_at),
  };
}
