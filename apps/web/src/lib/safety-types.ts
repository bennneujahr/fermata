// Antworten der Sicherheits-Schnittstelle (api.report, api.my_*, api.help_contacts, trust-view, venue-confirm).
// Quelle: supabase/migrations/2026100300071*_safety_*.sql, docs/bereiche/sicherheit.md (Abschnitt 10).

export type ReportContext = "abend" | "termin" | "gespraech" | "rueckmeldung" | "konto" | "sonstiges";
export type ReportCategory =
  | "uebergriff"
  | "bedrohung"
  | "minderjaehrig"
  | "belaestigung"
  | "diskriminierung"
  | "falsche_identitaet"
  | "betrug"
  | "nicht_erschienen"
  | "unangenehm"
  | "sonstiges";

export const REPORT_CONTEXTS: ReportContext[] = ["abend", "termin", "gespraech", "rueckmeldung", "konto", "sonstiges"];
/** Null-Toleranz (Standard der Einstellung safety.zero_tolerance_categories; die Datenbank entscheidet). */
export const ZERO_TOLERANCE: ReportCategory[] = ["uebergriff", "bedrohung", "minderjaehrig"];
export const OTHER_CATEGORIES: ReportCategory[] = [
  "belaestigung",
  "diskriminierung",
  "falsche_identitaet",
  "betrug",
  "nicht_erschienen",
  "unangenehm",
  "sonstiges",
];

export interface ReportResult {
  report_id: string;
  status: string;
  due_at: string;
  severity: "niedrig" | "mittel" | "hoch" | "akut";
}

export interface MyReport {
  id: string;
  context: ReportContext;
  category: ReportCategory;
  evening_id: string | null;
  status: "open" | "in_review" | "resolved" | "dismissed";
  created_at: string;
  due_at: string | null;
  resolved_at: string | null;
}

export interface MySanction {
  id: string;
  kind: "hinweis" | "vorlaeufige_sperre" | "sperre" | "ausschluss";
  reason: string;
  starts_at: string;
  ends_at: string | null;
  lifted_at: string | null;
}

export interface MyAppeal {
  id: string;
  sanction_id: string;
  status: "open" | "accepted" | "rejected";
  created_at: string;
  decided_at: string | null;
  decision_note: string | null;
}

export interface Phone {
  name: string;
  number: string;
  tel: string;
  hours?: string | null;
  description?: string | null;
}

export interface HelpContacts {
  heimwegtelefon: Phone | null;
  police: Phone;
  emergency: Phone;
  telefonseelsorge: { name: string; numbers: string[]; tels: string[]; hours?: string | null } | null;
  hilfetelefon_gewalt: Phone | null;
  note?: string | null;
}

export interface TrustShare {
  id: string;
  evening_id: string;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  active: boolean;
}

export interface CreatedTrustShare {
  share_id: string;
  token: string;
  expires_at: string;
  url: string;
}

export interface Venue {
  name: string;
  street?: string | null;
  postal_code?: string | null;
  city?: string | null;
  public_transport?: string | null;
  accessibility?: string | null;
}

/** Eigene Abende (api.my_evenings) – nur die Felder, die Sicherheit und Check-in brauchen. */
export interface MyEvening {
  evening_id: string;
  state: string;
  counterpart_first_name: string | null;
  venue: Venue | null;
  starts_at: string | null;
}

/** Öffentliche Ansicht „Abend teilen“ (trust-view mit Accept: application/json). */
export interface TrustView {
  first_name: string | null;
  starts_at: string | null;
  expires_at: string;
  venue: Venue | null;
  heimwegtelefon: { number: string; tel: string; hours?: string | null } | null;
  emergency_number: string;
}

/** Reservierung für das Lokal (venue-confirm mit Accept: application/json). */
export interface VenueReservation {
  venue_name: string | null;
  starts_at: string | null;
  table_code: string | null;
  reservation_name: string | null;
  persons: number | null;
  status: string | null;
  venue_confirmed_at: string | null;
}

export type CheckinStatus = "gut" | "unsicher" | "hilfe";
