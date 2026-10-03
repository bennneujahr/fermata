// Rückgaben der Admin-Funktionen (Schema api). Nur die Felder, die die Oberfläche nutzt.

export interface AdminToday {
  generated_at: string;
  runs_review: {
    id: string;
    period_starts_on: string | null;
    period_ends_on: string | null;
    finished_at: string | null;
    proposed_pairs: number | null;
    pending: number;
    with_warnings: number;
  }[];
  runs_failed_recent: number;
  runs_running: number;
  reports: {
    open: number;
    overdue: number;
    items: { id: string; category: string; category_label: string; severity: string; status: string; created_at: string; due_at: string | null; overdue: boolean }[];
  };
  flags_by_severity: Record<"akut" | "hoch" | "mittel" | "niedrig", number>;
  reservations_unconfirmed: {
    reservation_id: string;
    venue_id: string;
    venue_name: string;
    venue_city: string;
    reservation_mode: string;
    contact_phone: string | null;
    starts_at: string;
    table_code: string;
    venue_notified_at: string | null;
  }[];
  evenings_to_resolve: number;
  appeals: { open: number; oldest_at: string | null };
  provisional_suspensions: number;
  next_period: { id: string; starts_on: string; ends_on: string; ask_at: string; answer_until: string } | null;
}

/** null = unterdrückt (weniger als k). */
export type KCount = number | null;

export interface AdminKpis {
  generated_at: string;
  k: number;
  waitlist: {
    confirmed: KCount;
    unconfirmed: KCount;
    invited_to_app: KCount;
    by_region_group: Record<string, KCount>;
    by_source: Record<string, KCount>;
  } | null;
  funnel: { stage: string; n: KCount }[];
  last_run: {
    id: string;
    status: string;
    started_at: string | null;
    finished_at: string | null;
    pool_size: KCount;
    proposed_pairs: number | null;
    persons_with_proposal: KCount;
    matched_share: number | null;
    cost_eur: number | null;
    runtime_seconds: number | null;
  } | null;
  runs: { count: number; cost_eur_total: number; cost_eur_avg: number | null; cost_eur_per_proposal: number | null };
  evenings: { total: KCount; by_state: Record<string, KCount>; reached_confirmed: KCount };
  feedback: {
    count: KCount;
    match_quality_avg: number | null;
    venue_rating_avg: number | null;
    would_meet_again: Record<string, KCount>;
    felt_unsafe: KCount;
    contact_released: KCount;
  };
  costs: {
    sessions: number;
    eur_total: number;
    eur_per_session_median: number | null;
    eur_per_session_p90: number | null;
    eur_per_hour: number | null;
    target_eur_per_hour: number | null;
    latency_p90_median_ms: number | null;
  };
  safety: { reports_total: KCount; decided: KCount; decided_in_time: KCount; in_time_share: number | null; median_hours_to_decision: number | null };
  membership: { by_status: Record<string, KCount>; by_tier_active: Record<string, KCount> };
}

export interface Distribution {
  anzahl: number;
  min?: number;
  median?: number;
  mittel?: number;
  max?: number;
  histogramm?: { von: number; bis: number; anzahl: number }[];
}

export interface FairnessGroups {
  k: number;
  gruppen: { gruppe: string; im_pool: number; vorgeschlagen: number | null; anteil: number | null; hinweis: string | null }[];
  unterdrueckt: { anzahl_gruppen: number; im_pool: number | null; hinweis: string | null };
}

export interface RunReport {
  zeitraum?: { von: string; bis: string };
  pool?: { konten?: number; im_pool?: number; ausgeschlossen?: Record<string, number> };
  filter?: { paare_geprueft?: number; paare_bestanden?: number; verworfen?: Record<string, number>; lokale_aktiv?: number; lokale_mit_freiem_platz?: number };
  vorauswahl?: { paare?: number; kandidaten_je_person?: number; modus?: string };
  scores?: Record<string, Distribution>;
  mindestscore?: { wert: number; paare_darueber: number };
  ergebnis?: {
    vorschlaege?: number;
    personen_mit_vorschlag?: number;
    anteil_im_pool?: number;
    ohne_vorschlag?: Record<string, number>;
    wartebonus?: { personen_mit_wartezeit?: number; hoechste_wartezeit_laeufe?: number; vorschlaege_mit_bonus?: number };
  };
  lokale?: { nach_lokal?: Record<string, number>; verhaeltnis_ueberschritten?: number };
  pruefung?: { ersatztext_verwendet?: number; filter_treffer?: Record<string, number>; agent_art9_verdacht?: number; empfehlungen?: Record<string, number> };
  llm?: {
    aktiv?: boolean;
    backend?: string;
    modell?: string | null;
    bewertungen_angefragt?: number;
    aufrufe_bewertung?: number;
    wiederverwendet?: number;
    fehler?: number;
    ablehnungen?: number;
    aufrufe_pruef_agent?: number;
    token?: { eingabe?: number; ausgabe?: number; cache_lesen?: number; cache_schreiben?: number };
    kosten?: { llm_usd?: number; embeddings_usd?: number; gesamt_usd?: number; gesamt_eur?: number };
    kosten_hinweis?: string;
  };
  fairness?: { im_pool?: number; k?: number; nach_geschlecht?: FairnessGroups; nach_altersband?: FairnessGroups };
  laufzeit_sekunden?: Record<string, number>;
  freigabe?: { abgeschlossen_am?: string; freigegeben?: number; abgelehnt?: number; beim_abschluss_abgelehnt?: number };
  fehler?: { art?: string; text?: string };
}

export interface MatchRunRow {
  id: string;
  period_id: string | null;
  period_starts_on: string | null;
  period_ends_on: string | null;
  status: string;
  scheduled_for: string;
  started_at: string | null;
  finished_at: string | null;
  pool_size: number | null;
  candidate_pairs: number | null;
  proposed_pairs: number | null;
  pending_review: number;
  approved: number;
  rejected: number;
  cost_eur: number | null;
  error: string | null;
  report: RunReport;
}

export interface ReviewNotes {
  version?: string;
  agent?: { plausibel?: boolean; einschaetzung?: string; risiken?: string[]; art9_verdacht?: boolean; art9_hinweis?: string; empfehlung?: string } | null;
  agent_fehler?: string | null;
  art9_filter?: { ok?: boolean; treffer?: string[] };
  ersatztext_verwendet?: boolean;
  hinweise?: string[];
  empfehlung?: string;
}

export interface PairingRow {
  pairing_id: string;
  status: string;
  total_score: number;
  rule_score: number | null;
  llm_score: number | null;
  wait_bonus: number | null;
  subscores: Record<string, number | null>;
  llm_rationale: string | null;
  reasons_text: string | null;
  reasons_art9_clean: boolean | null;
  review_notes: ReviewNotes;
  venue_id: string | null;
  venue_name: string | null;
  venue_city: string | null;
  venue_reason: string | null;
  a_display_name: string | null;
  a_age_band: string | null;
  b_display_name: string | null;
  b_age_band: string | null;
  evening_id: string | null;
  reviewed_at: string | null;
  review_comment: string | null;
  created_at: string;
}

export interface PairingTimes {
  pairing_id: string;
  times: { starts_at: string; slot_id?: string }[] | string[];
  preview: boolean;
}

export interface ReportRow {
  id: string;
  created_at: string;
  due_at: string | null;
  overdue: boolean;
  status: string;
  severity: string;
  context: string;
  category: string;
  category_label: string;
  evening_id: string | null;
  reporter: string | null;
  reporter_name: string | null;
  reported: string | null;
  reported_name: string | null;
  related: boolean;
  description: string | null;
  wants_contact: boolean;
  prior_reports_against: number;
  active_sanction: string | null;
}

export interface SanctionRow {
  id: string;
  user_id: string;
  kind: string;
  reason: string;
  report_id: string | null;
  starts_at: string;
  ends_at: string | null;
  created_at: string;
  lifted_at: string | null;
  lift_reason: string | null;
  person?: string | null;
  appeal?: AppealRow | null;
}

export interface AppealRow {
  id: string;
  sanction_id: string;
  user_id: string;
  text: string;
  status: string;
  created_at: string;
  decided_at: string | null;
  decision_note: string | null;
  person?: string | null;
  sanction?: SanctionRow;
}

export interface FlagRow {
  id: string;
  user_id: string | null;
  email: string | null;
  source: string;
  kind: string;
  severity: string;
  details: Record<string, unknown>;
  created_at: string;
  reviewed_at: string | null;
  outcome: string | null;
}

export interface ReportDetail {
  report: ReportRow & { resolved_at: string | null; resolution: string | null; reporter: string | null; reported: string | null };
  reporter: { user_id: string | null; name: string | null };
  reported: { user_id: string; name: string | null; account_status: string | null } | null;
  evening: {
    id: string;
    state: string;
    starts_at: string | null;
    venue: { name: string; street: string; postal_code: string; city: string } | null;
    events: { at: string; event: string; from: string | null; to: string | null }[];
    checkins: { at: string; user_id: string; status: string }[];
  } | null;
  prior_reports_against: { id: string; created_at: string; category: string; status: string }[];
  sanctions: SanctionRow[];
  flags: FlagRow[];
}

export interface CaseSession {
  session_id: string;
  kind: string;
  mode: string;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  end_reason: string | null;
  safety_flagged: boolean;
  has_transcript: boolean;
  transcript_delete_at: string | null;
}

export interface TranscriptResult {
  session: Record<string, unknown> | null;
  turns: { role?: string; text?: string; at?: string }[];
  deleted: boolean;
}

export interface VenueRow {
  id: string;
  name: string;
  street: string;
  postal_code: string;
  city: string;
  active: boolean;
  reservation_mode: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  upcoming_slots: number;
  upcoming_free_tables: number;
  upcoming_reservations: number;
}

export interface Venue {
  id: string;
  name: string;
  street: string;
  postal_code: string;
  city: string;
  lat: number;
  lon: number;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  reservation_mode: string;
  description: string | null;
  accessibility: string | null;
  public_transport: string | null;
  agreement: Record<string, unknown>;
  active: boolean;
}

export interface SlotRow {
  slot_id: string;
  starts_at: string;
  tables: number;
  reserved: number;
  free: number;
  reservations: {
    reservation_id: string;
    evening_id: string;
    table_code: string;
    status: string;
    venue_notified_at: string | null;
    venue_confirmed_at: string | null;
    cancelled_at: string | null;
  }[];
}

export interface PeriodRow {
  id: string;
  starts_on: string;
  ends_on: string;
  ask_at: string;
  answer_until: string;
  people_with_windows: number;
  runs: { id: string; status: string }[];
}

export interface EveningToResolve {
  evening_id: string;
  starts_at: string;
  venue_name: string | null;
  venue_city: string | null;
  a_user_id: string;
  a_name: string;
  b_user_id: string;
  b_name: string;
  reasons: string[];
  feedback: { user_id: string; attended: boolean; other_attended: boolean | null; at: string }[];
  open_reports: number;
  flag_ids: string[];
}

export interface WaitlistStats {
  generated_at: string;
  totals: { confirmed: number; unconfirmed: number; founding_members: number; invited_to_app: number };
  by_region_group: { region_group: string; confirmed: number; unconfirmed: number; founding_members: number; last_base_number: number }[];
  by_day: { day: string; signups: number; confirmations: number }[];
  by_source: { source: string; signups: number; confirmed: number }[];
  link_hits: { slug: string; total: number; last_30_days: number }[];
  invites: { created: number; used: number };
}

export interface WaitlistEntry {
  id: string;
  place: number;
  first_name: string;
  email: string;
  region: string;
  postal_code: string;
  source: string | null;
  confirmed_at: string;
  is_founding_member: boolean;
  invited_to_app_at: string | null;
  bonus_steps: number;
}

export interface ContractActionRow {
  id: string;
  user_id: string | null;
  kind: string;
  at: string;
  details: Record<string, unknown>;
  result: Record<string, unknown>;
  confirmation_sent_at: string | null;
  effective_at: string | null;
}

export interface LedgerEntry {
  id: number;
  at: string;
  kind: string;
  amount: number;
  expires_at: string | null;
  note: string | null;
  evening_id: string | null;
}
