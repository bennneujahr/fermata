"use server";
// Gespräch mit Viola: Zugang (interview-token), Zusammenfassung (interview-summary), Transkript.
// Die Edge Functions prüfen alles Weitere (Ausweis, Einwilligung, Stufe, Tageslimit).
import { revalidatePath } from "next/cache";
import { functionsUrl, supabaseAnonKey } from "@/lib/env";
import { callFunction } from "@/lib/functions";
import { createClient } from "@/lib/supabase/server";
import { INTERVIEW_KINDS, type InterviewKind, type InterviewMode, type InterviewTokenResponse, type SummaryInfo, type TokenResult, type TranscriptRow } from "@/lib/viola/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuidOrNull = (v: unknown) => (typeof v === "string" && UUID.test(v) ? v : null);

export async function requestInterviewAction(input: {
  kind: InterviewKind;
  mode: InterviewMode;
  eveningId?: string | null;
  continuesSessionId?: string | null;
}): Promise<TokenResult> {
  const kind = INTERVIEW_KINDS.includes(input.kind) ? input.kind : "erstgespraech";
  const mode = input.mode === "text" ? "text" : "voice";
  const res = await callFunction<InterviewTokenResponse>("interview-token", {
    body: { kind, mode, evening_id: uuidOrNull(input.eveningId), continues_session_id: uuidOrNull(input.continuesSessionId) },
  });
  if (!res.ok || !res.data) return { ok: false, error: res.error ?? "generic", status: res.status };
  revalidatePath("/gespraech");
  return { ok: true, data: res.data };
}

/** „Text statt Stimme“ oder Fortsetzen einer offenen Sitzung als Text (keine neue Sitzung). */
export async function textAccessAction(sessionId: string): Promise<TokenResult> {
  const id = uuidOrNull(sessionId);
  if (!id) return { ok: false, error: "invalid_session_id", status: 400 };
  const res = await callFunction<InterviewTokenResponse>("interview-token", { body: { session_id: id, mode: "text" } });
  if (!res.ok || !res.data) return { ok: false, error: res.error ?? "generic", status: res.status };
  return { ok: true, data: res.data };
}

export async function getSummaryAction(sessionId: string): Promise<{ ok: true; data: SummaryInfo } | { ok: false; error: string }> {
  const id = uuidOrNull(sessionId);
  if (!id) return { ok: false, error: "session_not_found" };
  const res = await callFunction<SummaryInfo>(`interview-summary?session_id=${id}`, { method: "GET" });
  if (!res.ok || !res.data) return { ok: false, error: res.error ?? "generic" };
  return { ok: true, data: res.data };
}

export type SummaryActionResult =
  | { ok: true; summary_status: string }
  | { ok: false; error: string; categories?: string[] };

export async function summaryDecisionAction(sessionId: string, action: "confirm" | "correct" | "reject", text?: string): Promise<SummaryActionResult> {
  const id = uuidOrNull(sessionId);
  if (!id) return { ok: false, error: "session_not_found" };
  if (!["confirm", "correct", "reject"].includes(action)) return { ok: false, error: "invalid_action" };
  const body: Record<string, unknown> = { session_id: id, action };
  if (action === "correct") {
    const t = (text ?? "").trim();
    if (t.length < 20 || t.length > 4000) return { ok: false, error: "invalid_text" };
    body.text = t;
  }
  const res = await callFunctionRaw("interview-summary", body);
  if (!res.ok) {
    const categories = res.error === "art9_content" && res.message ? res.message.split(",").map((s) => s.trim()).filter(Boolean) : undefined;
    return { ok: false, error: res.error, categories };
  }
  revalidatePath("/gespraech", "layout");
  revalidatePath("/start");
  return { ok: true, summary_status: (res.data as { summary_status?: string })?.summary_status ?? action };
}

/** Wie callFunction, aber mit dem Feld message der Fehlerantwort (Kategorien bei art9_content). */
async function callFunctionRaw(name: string, body: unknown): Promise<{ ok: true; data: unknown } | { ok: false; error: string; message?: string }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { ok: false, error: "unauthorized" };
  try {
    const res = await fetch(`${functionsUrl()}/${name}`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, apikey: supabaseAnonKey(), "content-type": "application/json", "x-region": "eu-central-1" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const json = (await res.json().catch(() => null)) as { error?: string; message?: string } | null;
    if (!res.ok) return { ok: false, error: json?.error ?? `http_${res.status}`, message: json?.message };
    return { ok: true, data: json };
  } catch {
    return { ok: false, error: "network" };
  }
}

/** Bisheriger Gesprächstext (für die Fortsetzung als Text nach einem Neuladen). */
export async function transcriptTurnsAction(sessionId: string): Promise<TranscriptRow["turns"]> {
  const id = uuidOrNull(sessionId);
  if (!id) return [];
  const supabase = await createClient();
  const { data } = await supabase.schema("app").from("interview_transcripts").select("turns").eq("session_id", id).maybeSingle();
  return ((data as { turns?: TranscriptRow["turns"] } | null)?.turns ?? []).filter((t) => t && typeof t.text === "string");
}
