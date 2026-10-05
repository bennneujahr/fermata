// Vertrag mit Viola (docs/bereiche/viola.md, Abschnitt 8). Von Hand gepflegt.
import type { AddressForm } from "@/copy/form";

export type InterviewKind = "erstgespraech" | "vertiefung" | "nachbesprechung" | "korrektur";
export type InterviewMode = "voice" | "text";
export type SessionStatus = "requested" | "active" | "completed" | "aborted" | "failed";
export type SummaryStatus = "none" | "draft" | "confirmed" | "corrected" | "rejected";
export type EndReason = "fertig" | "person_beendet" | "zeitlimit" | "technik" | "krise" | "minderjaehrig" | "missbrauch";

export const INTERVIEW_KINDS: readonly InterviewKind[] = ["erstgespraech", "vertiefung", "nachbesprechung", "korrektur"];

export interface InterviewSessionInfo {
  id: string;
  kind: InterviewKind;
  mode: InterviewMode;
  address_form: AddressForm;
  tier_depth: string;
  room_name: string;
  expires_at: string;
  max_minutes: number;
  continues_session_id: string | null;
  evening_id: string | null;
  ai_notice_version: string;
}

export interface InterviewTokenResponse {
  session: InterviewSessionInfo;
  ai_notice: string;
  voice?: { url: string; token: string; room: string; identity: string };
  text?: { url: string; token: string; expires_at: string };
}

/** Ergebnis der Server Action: entweder Zugang oder ein Fehlercode aus interview-token. */
export type TokenResult = { ok: true; data: InterviewTokenResponse } | { ok: false; error: string; status: number };

export interface TextState {
  session_id: string;
  phase: string;
  ended: boolean;
  end_reason: EndReason | null;
  address_form: AddressForm;
  remaining_seconds: number;
  covered_blocks: string[];
}

export type ViolaEvent =
  | { type: "ai_notice"; spoken?: boolean }
  | { type: "summary_proposed"; text: string; partial: boolean }
  | { type: "crisis_resources"; lines: CrisisLines }
  | { type: "switch_to_text"; reason?: string }
  | { type: "ended"; reason: EndReason | string; summary_pending?: boolean };

export interface CrisisLines {
  telefonseelsorge?: string[];
  notruf?: string;
  [key: string]: unknown;
}

export interface SummaryInfo {
  session_id: string;
  kind: InterviewKind;
  status: SessionStatus;
  summary_status: SummaryStatus;
  summary_draft: string | null;
  summary_confirmed_at: string | null;
  covered_blocks: string[];
  end_reason: EndReason | null;
  address_form: AddressForm;
  analysis_status: "none" | "saved" | "skipped" | "failed";
  summary_version: number | null;
}

/** Zeile aus app.interview_sessions (RLS: nur eigene). */
export interface SessionRow {
  id: string;
  kind: InterviewKind;
  mode: InterviewMode;
  status: SessionStatus;
  summary_status: SummaryStatus;
  summary_draft: string | null;
  end_reason: EndReason | null;
  evening_id: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  covered_blocks: string[];
}

export interface TranscriptRow {
  session_id: string;
  turns: { role: "viola" | "person"; text: string; at?: string }[];
  delete_at: string;
}

/** Ein Ereignis aus beliebiger Quelle (Datenpaket, SSE) prüfen und typisieren. */
export function parseViolaEvent(raw: unknown): ViolaEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  switch (o.type) {
    case "ai_notice":
      return { type: "ai_notice", spoken: o.spoken === true };
    case "summary_proposed":
      return typeof o.text === "string" ? { type: "summary_proposed", text: o.text, partial: o.partial === true } : null;
    case "crisis_resources":
      return { type: "crisis_resources", lines: (o.lines && typeof o.lines === "object" ? o.lines : {}) as CrisisLines };
    case "switch_to_text":
      return { type: "switch_to_text", reason: typeof o.reason === "string" ? o.reason : undefined };
    case "ended":
      return { type: "ended", reason: typeof o.reason === "string" ? o.reason : "fertig", summary_pending: o.summary_pending === true };
    default:
      return null;
  }
}

/** Datenpaket (Bytes) → Ereignis. */
export function decodeDataPacket(payload: Uint8Array): ViolaEvent | null {
  try {
    return parseViolaEvent(JSON.parse(new TextDecoder().decode(payload)));
  } catch {
    return null;
  }
}

/** Zustand des Agenten (LiveKit-Attribut lk.agent.state) → Zustand von <fermata-atem>. */
export type AtemState = "ruhig" | "hoert" | "denkt" | "spricht" | "pause";

export function atemStateFor(agentState: string | undefined, paused: boolean): AtemState {
  if (paused) return "pause";
  switch (agentState) {
    case "listening":
      return "hoert";
    case "thinking":
      return "denkt";
    case "speaking":
      return "spricht";
    default:
      return "ruhig";
  }
}
