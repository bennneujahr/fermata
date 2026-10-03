// Antworten der Abend-Funktionen (docs/bereiche/abende.md, Abschnitt 5). Von Hand gepflegt; auch im Browser nutzbar.

export type EveningState =
  | "proposed"
  | "time_requested"
  | "time_countered"
  | "confirmed"
  | "declined"
  | "lapsed"
  | "cancelled_early"
  | "cancelled_late"
  | "happened"
  | "no_show";

export type MyAction = "choose_time" | "answer_time" | "wait" | "prepare" | "find" | "feedback" | "contact" | "debrief" | "none";

export const OPEN_STATES: readonly EveningState[] = ["proposed", "time_requested", "time_countered", "confirmed"];

export interface Venue {
  name: string;
  street: string | null;
  postal_code: string | null;
  city: string | null;
  public_transport: string | null;
  accessibility: string | null;
  description: string | null;
}

export interface EveningListItem {
  evening_id: string;
  state: EveningState;
  my_action: MyAction;
  my_deadline_at: string | null;
  counterpart_first_name: string | null;
  reasons_text: string | null;
  venue: Venue | null;
  proposed_times: string[];
  requested_times: string[];
  countered_times: string[];
  requested_by_me: boolean;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
}

export interface ContactShare {
  status: "none" | "pending" | "closed" | "released";
  released_at?: string;
  mine: { share_email: boolean; share_phone: boolean } | null;
  /** withdrawn: Das Gegenüber hat die Einwilligung „kontakttausch“ widerrufen – dann keine Daten mehr zeigen. */
  counterpart: { first_name: string | null; email: string | null; phone: string | null; withdrawn?: boolean } | null;
}

export interface DebriefOffer {
  eligible: boolean;
  reason: "tier" | "not_applicable" | "feedback_missing" | "not_attended" | "done" | "expired" | null;
  minutes: number;
  tier: string | null;
  offer_until: string | null;
  session_id: string | null;
  session_status: string | null;
}

export interface FeedbackMine {
  attended: boolean;
  other_attended: boolean | null;
  wants_contact: boolean;
  would_meet_again: "ja" | "nein" | "vielleicht" | null;
  felt_safe: boolean | null;
  venue_rating: number | null;
  match_quality: number | null;
  note: string | null;
}

export interface EveningDetail extends Omit<EveningListItem, "my_deadline_at"> {
  my_deadline_at: string | null;
  countered_by_me: boolean;
  time_options: { starts_at: string; source: "proposed" | "shared_window" }[];
  max_times_per_answer: number;
  rounds_left: number;
  late_cancel_from: string | null;
  reservation: { name: string; table_code: string; persons: number } | null;
  find_window: { opens_at: string; closes_at: string } | null;
  my_recognition_hint: string | null;
  feedback: { submitted: boolean; open: boolean; open_until: string | null; mine: FeedbackMine | null };
  contact_share: ContactShare | null;
  debrief: DebriefOffer | null;
  cancelled_by_me: boolean;
}

export interface FindInfo {
  opens_at: string;
  closes_at: string;
  starts_at: string;
  reservation_name: string;
  table_code: string | null;
  venue: Venue | null;
  counterpart_first_name: string | null;
  counterpart_hint: string | null;
  my_hint: string | null;
  counterpart_photo_url: null;
}

export interface PeriodRow {
  period_id: string;
  starts_on: string;
  ends_on: string;
  answer_until: string;
  is_open: boolean;
  window_count: number;
}

export interface WindowRow {
  window_id: string;
  starts_at: string;
  ends_at: string;
}

export interface PushSubscriptionRow {
  id: string;
  platform: "ios" | "android" | "desktop" | null;
  created_at: string;
  last_success_at: string | null;
}

export const DECLINE_REASONS = ["termin", "krank", "kein_interesse", "lokal", "sicherheit", "sonstiges"] as const;
export type DeclineReason = (typeof DECLINE_REASONS)[number];

/** Uhrzeiten, die die andere Person gerade angeboten hat (zum Bestätigen). */
export function offeredTimes(d: Pick<EveningDetail, "state" | "requested_times" | "countered_times">): string[] {
  if (d.state === "time_requested") return d.requested_times ?? [];
  if (d.state === "time_countered") return d.countered_times ?? [];
  return [];
}

/** Liegt der Abend in der Zukunft oder läuft er noch (für „kommende“ / „vergangene“)? */
export function isUpcoming(e: Pick<EveningListItem, "state" | "starts_at" | "ends_at">, now: Date): boolean {
  if (e.state === "proposed" || e.state === "time_requested" || e.state === "time_countered") return true;
  if (e.state === "confirmed") return !e.ends_at || new Date(e.ends_at).getTime() + 12 * 3_600_000 > now.getTime();
  return false;
}

/** Ändern der Uhrzeit-Liste mit Obergrenze (1–max): an/aus. */
export function toggleTime(list: string[], t: string, max: number): string[] {
  if (list.includes(t)) return list.filter((x) => x !== t);
  if (list.length >= max) return list;
  return [...list, t].sort();
}
