// Warnungen eines Vorschlags (dieselbe Regel wie api.admin_today: with_warnings). Sammelfreigabe nur ohne Warnung.
import type { PairingRow } from "./types";

export type PairingWarning = "hinweise" | "empfehlung" | "ersatztext" | "art9_filter" | "art9_verdacht" | "agent_fehler" | "ohne_llm" | "ohne_lokal";

export function pairingWarnings(p: Pick<PairingRow, "review_notes" | "llm_score" | "venue_id">): PairingWarning[] {
  const n = p.review_notes ?? {};
  const w: PairingWarning[] = [];
  if ((n.hinweise ?? []).length > 0) w.push("hinweise");
  if ((n.empfehlung ?? "freigeben") !== "freigeben") w.push("empfehlung");
  if (n.ersatztext_verwendet) w.push("ersatztext");
  if (n.art9_filter && n.art9_filter.ok === false) w.push("art9_filter");
  if (n.agent?.art9_verdacht) w.push("art9_verdacht");
  if (n.agent_fehler) w.push("agent_fehler");
  if (p.llm_score === null || p.llm_score === undefined) w.push("ohne_llm");
  if (!p.venue_id) w.push("ohne_lokal");
  return w;
}

export function hasWarnings(p: Pick<PairingRow, "review_notes" | "llm_score" | "venue_id">): boolean {
  return pairingWarnings(p).length > 0;
}
