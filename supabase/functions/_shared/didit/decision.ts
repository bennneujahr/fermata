// Übersetzt Didit-Antworten (Webhook und Entscheidung) in Fermatas Begriffe.
// Didit hat die Form über die API-Versionen geändert (kyc → id_verification → id_verifications[]);
// alle drei Formen werden gelesen. PLATZHALTER: vor Start mit der Didit-Sandbox prüfen (docs/bereiche/web.md).
import type { DiditDecision, VerificationOutcome } from "./types.ts";

/** Didit-Status → Fermata. null = noch nicht abgeschlossen (z. B. „Not Started“, „In Progress“). */
export function mapStatus(status: unknown): VerificationOutcome | null {
  const s = String(status ?? "").trim().toLowerCase().replace(/[_-]+/g, " ");
  switch (s) {
    case "approved":
      return "approved";
    case "declined":
    case "rejected":
      return "declined";
    case "in review":
    case "review":
    case "resubmitted":
      return "in_review";
    case "expired":
    case "abandoned":
    case "kyc expired":
      return "expired";
    case "error":
    case "failed":
      return "error";
    default:
      return null;
  }
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

/** Geburtsdatum als YYYY-MM-DD (Didit liefert ISO; andere Formen werden verworfen). */
export function isoDate(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (d.getUTCFullYear() !== Number(m[1]) || d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[3])) {
    return null;
  }
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function idBlock(d: Obj): Obj | null {
  if (isObj(d.id_verification)) return d.id_verification;
  if (Array.isArray(d.id_verifications) && isObj(d.id_verifications[0])) return d.id_verifications[0];
  if (isObj(d.kyc)) return d.kyc;
  return null;
}

/** Liest eine Entscheidung (GET /v2/session/{id}/decision/ oder decision im Webhook). */
export function parseDecision(raw: unknown, fallbackSessionId = ""): DiditDecision {
  const d = isObj(raw) ? raw : {};
  const id = idBlock(d) ?? {};
  let first = str(id.first_name);
  let last = str(id.last_name);
  if (!first && !last) {
    // Nur voller Name vorhanden: letztes Wort als Nachname (für den Abgleich ausreichend, PLATZHALTER).
    const full = str(id.full_name);
    if (full) {
      const parts = full.split(/\s+/);
      last = parts.pop() ?? null;
      first = parts.join(" ") || null;
    }
  }
  return {
    sessionId: str(d.session_id) ?? fallbackSessionId,
    outcome: mapStatus(d.status ?? id.status),
    firstName: first,
    lastName: last,
    birthDate: isoDate(id.date_of_birth ?? id.birth_date),
    documentNumber: str(id.document_number) ?? str(id.personal_number),
  };
}
