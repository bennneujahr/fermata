// Platzhalter in den Einstellungen und ihre Frage in docs/PLATZHALTER.md.
// Erst die Angabe „Frage X1“ in der Beschreibung, sonst die Zuordnung aus der Tabelle „Wo im Code“ (Test: placeholders.test.ts).

export const PLACEHOLDER_QUESTIONS: Record<string, string> = {
  "site.domain": "A3",
  "site.app_url": "A3",
  "notify.mail_from_address": "A3",
  "landing.hoerprobe_enabled": "A4",
  "landing.vat_mode": "A5",
  "landing.prices_mode": "A5",
  "site.contact_email": "A7",
  "site.start_month": "A8",
  "account.collect_street": "B1",
  "voice.tts_provider": "B4",
  "voice.tts_voice": "B4",
  "interview.transcript_retention_days": "B5",
  "evening.debrief_minutes": "B6",
  "evening.credit_validity_months": "B8",
  "billing.loge_in_test_phase": "B11",
  "billing.tiers": "C1",
  "matching.wait_bonus_per_round": "C4",
  "matching.wait_bonus_max": "C4",
  "matching.weights": "C5",
  "matching.llm_weight": "C5",
  "matching.max_distance_km": "C6",
  "waitlist.confirm_token_hours": "C7",
  "evening.default_duration_minutes": "C8",
  "notify.quiet_hours": "C9",
};

export function isPlaceholder(description: string | null | undefined): boolean {
  return /PLATZHALTER/i.test(description ?? "");
}

export function placeholderQuestion(key: string, description: string | null | undefined): string | null {
  const m = /Frage ([A-C]\d{1,2})\b/.exec(description ?? "");
  if (m) return m[1]!;
  return PLACEHOLDER_QUESTIONS[key] ?? null;
}

/** Anker der Abschnitte in docs/PLATZHALTER.md (GitHub-Überschriften). */
export function placeholderAnchor(q: string): string {
  if (q.startsWith("A")) return "a-vor-der-live-schaltung-der-landingpage";
  if (q.startsWith("B")) return "b-später-mit-meilenstein";
  return "c-platzhalter-aus-dem-bau";
}
