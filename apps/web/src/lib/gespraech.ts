// Daten für das Gespräch (Server Components). Sitzungen und Transkripte liest die Person direkt (RLS: nur eigene).
import "server-only";
import { cache } from "react";
import { fermataEnv } from "@/lib/env";
import { getSession } from "@/lib/data";
import type { CrisisLines, InterviewKind, SessionRow, TranscriptRow } from "@/lib/viola/types";

export type Tier = "auftakt" | "andante" | "loge";

/** Gesprächsarten je Stufe wie in interview.kinds_by_tier (Start-Wert). Die Datenbank entscheidet endgültig. */
export const KINDS_BY_TIER: Record<Tier, InterviewKind[]> = {
  auftakt: ["erstgespraech", "korrektur"],
  andante: ["erstgespraech", "vertiefung", "nachbesprechung", "korrektur"],
  loge: ["erstgespraech", "vertiefung", "nachbesprechung", "korrektur"],
};

export const getInterviewSessions = cache(async (limit = 20): Promise<SessionRow[]> => {
  const { supabase } = await getSession();
  const { data } = await supabase
    .schema("app")
    .from("interview_sessions")
    .select("id, kind, mode, status, summary_status, summary_draft, end_reason, evening_id, started_at, ended_at, created_at, covered_blocks")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as SessionRow[];
});

export const getInterviewSession = cache(async (id: string): Promise<SessionRow | null> => {
  const { supabase } = await getSession();
  const { data } = await supabase
    .schema("app")
    .from("interview_sessions")
    .select("id, kind, mode, status, summary_status, summary_draft, end_reason, evening_id, started_at, ended_at, created_at, covered_blocks")
    .eq("id", id)
    .maybeSingle();
  return (data ?? null) as SessionRow | null;
});

/** Löschdatum je Sitzung (ohne Inhalt, für die Liste). */
export const getTranscriptDeletion = cache(async (): Promise<Map<string, string>> => {
  const { supabase } = await getSession();
  const { data } = await supabase.schema("app").from("interview_transcripts").select("session_id, delete_at");
  return new Map(((data ?? []) as { session_id: string; delete_at: string }[]).map((r) => [r.session_id, r.delete_at]));
});

export const getTranscript = cache(async (sessionId: string): Promise<TranscriptRow | null> => {
  const { supabase } = await getSession();
  const { data } = await supabase.schema("app").from("interview_transcripts").select("session_id, turns, delete_at").eq("session_id", sessionId).maybeSingle();
  return (data ?? null) as TranscriptRow | null;
});

export interface ProfileSummary {
  summary_text: string | null;
  summary_confirmed_at: string | null;
  summary_version: number;
}

export const getProfileSummary = cache(async (): Promise<ProfileSummary | null> => {
  const { supabase, claims } = await getSession();
  if (!claims?.sub) return null;
  const { data } = await supabase.schema("app").from("profile_core").select("summary_text, summary_confirmed_at, summary_version").eq("user_id", claims.sub).maybeSingle();
  return (data ?? null) as ProfileSummary | null;
});

export const getTier = cache(async (): Promise<Tier> => {
  const { supabase, claims } = await getSession();
  if (!claims?.sub) return "auftakt";
  const { data } = await supabase.schema("app").from("accounts").select("tier_view").eq("user_id", claims.sub).maybeSingle();
  const t = (data as { tier_view?: string } | null)?.tier_view;
  return t === "andante" || t === "loge" ? t : "auftakt";
});

/** Sprechen ist möglich, wenn LiveKit eingerichtet ist (Adresse für die CSP) oder die Attrappe läuft. */
export function voiceSetup(): { enabled: boolean; fake: boolean } {
  const fake = process.env.VIOLA_VOICE_MODE === "fake" && fermataEnv() !== "production";
  return { enabled: fake || Boolean(process.env.NEXT_PUBLIC_LIVEKIT_URL), fake };
}

/** Offene Sitzung (läuft noch) – kann als Text fortgesetzt werden. */
export function openSession(rows: SessionRow[]): SessionRow | null {
  return rows.find((r) => r.status === "active") ?? null;
}

/** Letzte Sitzung, die wegen Zeit oder Technik endete und fortgesetzt werden kann (innerhalb von 7 Tagen). */
export function continuableSession(rows: SessionRow[], now: Date): SessionRow | null {
  const latest = rows.find((r) => r.status !== "aborted");
  if (!latest || !latest.ended_at) return null;
  if (latest.end_reason !== "zeitlimit" && latest.end_reason !== "technik") return null;
  if (latest.summary_status === "confirmed" || latest.summary_status === "corrected") return null;
  if (now.getTime() - new Date(latest.ended_at).getTime() > 7 * 86_400_000) return null;
  if (rows.some((r) => r.created_at > latest.created_at)) return null;
  return latest;
}

/**
 * Krisen-Nummern aus api.help_contacts() (eine Quelle mit safety.crisis_lines()). Nur Rückfall, falls ein
 * Datenpaket crisis_resources ohne Nummern käme; das Paket von Viola hat Vorrang.
 */
export const getCrisisFallback = cache(async (): Promise<CrisisLines | null> => {
  try {
    const { supabase } = await getSession();
    const { data } = await supabase.schema("api").rpc("help_contacts");
    const h = (data ?? {}) as { telefonseelsorge?: { numbers?: unknown }; emergency?: { number?: unknown } };
    const numbers = Array.isArray(h.telefonseelsorge?.numbers) ? h.telefonseelsorge.numbers.filter((n): n is string => typeof n === "string") : [];
    const notruf = typeof h.emergency?.number === "string" ? h.emergency.number : undefined;
    return numbers.length || notruf ? { telefonseelsorge: numbers, notruf } : null;
  } catch {
    return null;
  }
});
