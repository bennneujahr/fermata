"use server";
// Sicherheit: Melden, Widerspruch, Abend teilen, Check-in (angemeldet, RPC im Schema api)
// und die öffentlichen Seiten für Vertrauensperson und Lokal (Edge Functions trust-view, venue-confirm).
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/billing-types";
import { callPublicFunction } from "@/lib/public-functions";
import type {
  CheckinStatus,
  CreatedTrustShare,
  HelpContacts,
  ReportCategory,
  ReportContext,
  ReportResult,
  TrustView,
  VenueReservation,
} from "@/lib/safety-types";
import { OTHER_CATEGORIES, REPORT_CONTEXTS, ZERO_TOLERANCE } from "@/lib/safety-types";
import { asReservation } from "@/lib/safety-rules";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN = /^[A-Za-z0-9_.=-]{8,256}$/;

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<ActionResult<T>> {
  const supabase = await createClient();
  const { data, error } = await supabase.schema("api").rpc(fn, args);
  if (error) return { ok: false, error: error.hint || (error.code === "PGRST301" ? "not_authenticated" : "generic"), message: error.message };
  return { ok: true, data: data as T };
}

/**
 * Die gemeldete Person bei einer Meldung zu einem Abend: das Gegenüber. Die Oberfläche kennt nur den Vornamen;
 * die ID liest der Server mit der Sitzung der meldenden Person (RLS: nur eigene Abende). Fehlt das Leserecht,
 * geht die Meldung ohne gemeldete Person ein (Benn sieht den Abend).
 */
async function counterpartOf(eveningId: string): Promise<string | null> {
  const supabase = await createClient();
  const [{ data: claims }, { data }] = await Promise.all([
    supabase.auth.getClaims(),
    supabase.schema("app").from("evenings").select("user_a, user_b").eq("id", eveningId).maybeSingle(),
  ]);
  const me = (claims?.claims as { sub?: string } | undefined)?.sub;
  const row = data as { user_a?: string; user_b?: string } | null;
  if (!me || !row?.user_a || !row.user_b) return null;
  return row.user_a === me ? row.user_b : row.user_a;
}

export interface ReportInput {
  context: ReportContext;
  category: ReportCategory;
  eveningId?: string | null;
  /** true: Die Meldung betrifft das Gegenüber dieses Abends. */
  aboutCounterpart?: boolean;
  description?: string;
  wantsContact: boolean;
}

export async function submitReport(input: ReportInput): Promise<ActionResult<ReportResult>> {
  if (!REPORT_CONTEXTS.includes(input.context)) return { ok: false, error: "invalid_context" };
  if (![...ZERO_TOLERANCE, ...OTHER_CATEGORIES].includes(input.category)) return { ok: false, error: "invalid_category" };
  const description = (input.description ?? "").trim();
  if (description.length > 4000) return { ok: false, error: "description_too_long" };
  const eveningId = input.eveningId && UUID.test(input.eveningId) ? input.eveningId : null;
  const reported = eveningId && input.aboutCounterpart ? await counterpartOf(eveningId) : null;
  const res = await rpc<ReportResult>("report", {
    p_context: input.context,
    p_category: input.category,
    p_reported_user: reported,
    p_evening_id: eveningId,
    p_description: description || null,
    p_wants_contact: input.wantsContact,
  });
  if (res.ok) revalidatePath("/sicherheit", "layout");
  return res;
}

export async function submitAppeal(sanctionId: string, text: string): Promise<ActionResult<{ appeal_id: string; status: string }>> {
  if (!UUID.test(sanctionId)) return { ok: false, error: "sanction_not_found" };
  const t = text.trim();
  if (t.length < 10 || t.length > 4000) return { ok: false, error: "invalid_text" };
  const res = await rpc<{ appeal_id: string; status: string }>("appeal", { p_sanction_id: sanctionId, p_text: t });
  if (res.ok) revalidatePath("/sicherheit", "layout");
  return res;
}

export async function createTrustShare(eveningId: string): Promise<ActionResult<CreatedTrustShare>> {
  if (!UUID.test(eveningId)) return { ok: false, error: "evening_not_found" };
  const res = await rpc<CreatedTrustShare>("create_trust_share", { p_evening_id: eveningId });
  if (res.ok) revalidatePath("/sicherheit", "layout");
  return res;
}

export async function revokeTrustShare(shareId: string): Promise<ActionResult<boolean>> {
  if (!UUID.test(shareId)) return { ok: false, error: "generic" };
  const res = await rpc<boolean>("revoke_trust_share", { p_share_id: shareId });
  if (res.ok) revalidatePath("/sicherheit", "layout");
  return res;
}

export async function respondCheckin(
  eveningId: string,
  status: CheckinStatus,
): Promise<ActionResult<{ checkin_id: string; status: CheckinStatus; help: HelpContacts | null }>> {
  if (!UUID.test(eveningId)) return { ok: false, error: "evening_not_found" };
  if (!["gut", "unsicher", "hilfe"].includes(status)) return { ok: false, error: "invalid_status" };
  return rpc("checkin_respond", { p_evening_id: eveningId, p_status: status });
}

// ---------------------------------------------------------------------------
// Öffentlich (ohne Anmeldung)
// ---------------------------------------------------------------------------

/** „Abend teilen“: Ansicht für die Vertrauensperson (trust-view, JSON). null = Link ungültig. */
export async function loadTrustView(token: string): Promise<ActionResult<TrustView | null>> {
  if (!TOKEN.test(token)) return { ok: true, data: null };
  // Bevorzugt mit dem Schlüssel im JSON-Körper (landet nicht in Zugriffsprotokollen); kann die Function das noch
  // nicht (405), wie bisher per GET mit ?t=.
  let res = await callPublicFunction<TrustView>("trust-view", { method: "POST", body: { t: token } });
  if (res.status === 405 || (!res.ok && !res.json)) res = await callPublicFunction<TrustView>("trust-view", { method: "GET", query: { t: token } });
  if (res.ok && res.data) return { ok: true, data: res.data };
  if (res.status === 404 || res.status === 400) return { ok: true, data: null };
  return { ok: false, error: res.error ?? "generic" };
}

export interface VenueLoad {
  /** Reservierung (null, wenn die Function noch kein JSON liefert: dann nur der Knopf). */
  reservation: VenueReservation | null;
  /** Link gültig? */
  valid: boolean;
}

/** Reservierung für das Lokal laden (venue-confirm, GET mit Accept: application/json). */
export async function loadVenueReservation(token: string): Promise<ActionResult<VenueLoad>> {
  if (!TOKEN.test(token)) return { ok: true, data: { reservation: null, valid: false } };
  const res = await callPublicFunction<unknown>("venue-confirm", { method: "GET", query: { t: token } });
  if (res.status === 400 || res.status === 404) return { ok: true, data: { reservation: null, valid: false } };
  if (!res.ok) return { ok: false, error: res.error ?? "generic" };
  // Ohne JSON (ältere Fassung der Function): Link gültig, Einzelheiten stehen in der Mail.
  return { ok: true, data: { reservation: res.json ? asReservation(res.data) : null, valid: true } };
}

/** Reservierung bestätigen (venue-confirm, POST). Erst der Klick bestätigt, nie das bloße Öffnen. */
export async function confirmVenueReservation(token: string): Promise<ActionResult<VenueReservation | null>> {
  if (!TOKEN.test(token)) return { ok: false, error: "invalid_link" };
  // Vertrag: Schlüssel im JSON-Körper, Antwort als JSON.
  const res = await callPublicFunction<unknown>("venue-confirm", { method: "POST", body: { t: token } });
  if (res.json) {
    if (res.ok) return { ok: true, data: asReservation(res.data) };
    if (res.status === 400 || res.status === 404) return { ok: false, error: "invalid_link" };
    return { ok: false, error: res.error ?? "generic" };
  }
  // Ältere Fassung der Function (nur HTML, Schlüssel als Formularfeld oder in der Adresse).
  const legacy = await callPublicFunction<unknown>("venue-confirm", { method: "POST", query: { t: token }, form: { t: token } });
  if (legacy.ok) return { ok: true, data: legacy.json ? asReservation(legacy.data) : null };
  if (legacy.status === 400 || legacy.status === 404) return { ok: false, error: "invalid_link" };
  return { ok: false, error: legacy.error ?? "generic" };
}
