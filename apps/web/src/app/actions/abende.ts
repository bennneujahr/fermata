"use server";
// Abende: Terminabstimmung, Absage, Erkennungszeichen, Rückmeldung. Alle Regeln liegen in der Datenbank
// (api.evening_*); hier nur Aufruf und Fehlerkennung (hint) für die Texte in src/copy/abende.ts.
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { DECLINE_REASONS } from "@/lib/evening-types";

export type EveningActionResult = { ok: true; data?: unknown } | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

async function call(fn: string, args: Record<string, unknown>, id: string): Promise<EveningActionResult> {
  if (!UUID.test(id)) return { ok: false, error: "not_participant" };
  const supabase = await createClient();
  const { data, error } = await supabase.schema("api").rpc(fn, args);
  if (error) return { ok: false, error: error.hint || (error.code === "P0001" ? "generic" : "generic") };
  revalidatePath("/abende");
  revalidatePath(`/abende/${id}`, "layout");
  revalidatePath("/start");
  return { ok: true, data };
}

function times(list: unknown): string[] | null {
  if (!Array.isArray(list)) return null;
  const out = list.filter((t): t is string => typeof t === "string" && ISO.test(t));
  return out.length === list.length && out.length > 0 && out.length <= 3 ? out : null;
}

export async function requestTimeAction(eveningId: string, list: string[]): Promise<EveningActionResult> {
  const t = times(list);
  if (!t) return { ok: false, error: "invalid_times" };
  return call("evening_request_time", { p_evening_id: eveningId, p_times: t }, eveningId);
}

export async function counterAction(eveningId: string, list: string[]): Promise<EveningActionResult> {
  const t = times(list);
  if (!t) return { ok: false, error: "invalid_times" };
  return call("evening_counter", { p_evening_id: eveningId, p_times: t }, eveningId);
}

export async function confirmTimeAction(eveningId: string, time: string): Promise<EveningActionResult> {
  if (!ISO.test(time)) return { ok: false, error: "time_not_offered" };
  return call("evening_confirm", { p_evening_id: eveningId, p_time: time }, eveningId);
}

function reason(r: unknown): string | null {
  return typeof r === "string" && (DECLINE_REASONS as readonly string[]).includes(r) ? r : null;
}

export async function declineAction(eveningId: string, r: string | null): Promise<EveningActionResult> {
  return call("evening_decline", { p_evening_id: eveningId, p_reason: reason(r) }, eveningId);
}

export async function cancelAction(eveningId: string, r: string | null): Promise<EveningActionResult> {
  return call("evening_cancel", { p_evening_id: eveningId, p_reason: reason(r) }, eveningId);
}

export async function recognitionHintAction(eveningId: string, hint: string): Promise<EveningActionResult> {
  return call("set_recognition_hint", { p_evening_id: eveningId, p_hint: hint.slice(0, 200) }, eveningId);
}

export interface FeedbackInput {
  attended: boolean | null;
  otherAttended: boolean | null;
  feltSafe: boolean | null;
  wouldMeetAgain: "ja" | "nein" | "vielleicht" | null;
  venueRating: number | null;
  matchQuality: number | null;
  note: string;
  wantsContact: boolean;
  shareEmail: boolean;
  sharePhone: boolean;
  /** Einwilligung „kontakttausch“ direkt im Formular: Fassung des gelesenen Textes. */
  contactConsentVersion?: string | null;
}

const rating = (n: unknown) => (typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 5 ? n : null);

export async function submitFeedbackAction(eveningId: string, input: FeedbackInput): Promise<EveningActionResult> {
  if (input.attended === null || typeof input.attended !== "boolean") return { ok: false, error: "invalid_input" };
  const wants = Boolean(input.wantsContact) && input.attended;
  if (wants && !input.shareEmail && !input.sharePhone) return { ok: false, error: "nothing_to_share" };
  const note = (input.note ?? "").trim();
  if (note.length > 2000) return { ok: false, error: "text_too_long" };
  if (wants && input.contactConsentVersion) {
    const supabase = await createClient();
    const { error } = await supabase.schema("api").rpc("give_consent", { p_kind: "kontakttausch", p_version: input.contactConsentVersion });
    if (error) return { ok: false, error: error.hint === "version_mismatch" ? "version_mismatch" : error.hint || "generic" };
  }
  return call(
    "submit_feedback",
    {
      p_evening_id: eveningId,
      p_attended: input.attended,
      p_other_attended: input.attended ? input.otherAttended : null,
      p_wants_contact: wants,
      p_would_meet_again: input.attended && ["ja", "nein", "vielleicht"].includes(input.wouldMeetAgain ?? "") ? input.wouldMeetAgain : null,
      p_felt_safe: typeof input.feltSafe === "boolean" ? input.feltSafe : null,
      p_venue_rating: input.attended ? rating(input.venueRating) : null,
      p_match_quality: input.attended ? rating(input.matchQuality) : null,
      p_note: note || null,
      p_share_email: wants && Boolean(input.shareEmail),
      p_share_phone: wants && Boolean(input.sharePhone),
    },
    eveningId,
  );
}
