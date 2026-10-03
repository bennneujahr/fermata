// Antworten der Mitgliedschafts-Schnittstelle (api.billing_*, Edge Functions billing-*).
// Quelle: supabase/migrations/2026100300062*_billing_*.sql, docs/bereiche/mitgliedschaft.md (Abschnitt 9).

export type MembershipStatus = "free" | "pending" | "active" | "cancelled" | "ended" | "past_due" | "withdrawn";

export interface Tier {
  key: string;
  name: string;
  price_cents: number;
  price_display: string;
  evenings: number;
  period_days: number;
  orderable: boolean;
  note: string | null;
  vat_note: string;
}

export interface ContractAction {
  id: string;
  kind: "order" | "cancel" | "withdraw";
  at: string;
  effective_at: string | null;
  confirmation_sent_at: string | null;
  contract_number: string | null;
}

export interface BillingOverview {
  status: MembershipStatus;
  tier: string | null;
  tier_name: string | null;
  contract_number: string | null;
  ordered_at: string | null;
  cancel_at: string | null;
  cancelled_at: string | null;
  withdrawn_at: string | null;
  free_phase: { active: boolean; ended_at: string | null };
  current_period: {
    starts_at: string;
    ends_at: string;
    extended_until: string | null;
    extended_by_rule: boolean;
    evenings_allowed: number;
  } | null;
  available_evenings: number;
  reserved_evenings: number;
  can_receive_proposal: boolean;
  withdrawal: { possible: boolean; until: string | null };
  cancellation: { possible: boolean; effective_at: string | null };
  tiers: Tier[];
  vat_note: string;
  order_button_label: string;
  cancel_entry_label: string;
  withdraw_entry_label: string;
  /** Optional (Vertrag mit der Härtung): Verlauf der Vertragserklärungen direkt in der Übersicht. */
  history?: ContractAction[];
}

export interface OrderSummary {
  tier: string;
  tier_name: string;
  price_cents: number;
  price_display: string;
  currency: string;
  vat_note: string;
  period_days: number;
  period_label: string;
  evenings_per_period: number;
  tier_note: string | null;
  renewal: string;
  cancellation_terms: string;
  withdrawal_note: string;
  extension_rule: string | null;
  button_label: string;
  legal_status: string;
  summary_hash: string;
  /** Vertrag mit der Härtung: Text des Häkchens „vorzeitiger Beginn“ (Pflicht vor dem Bestellknopf). */
  start_request_text?: string | null;
  /** Vertrag mit der Härtung: Adresse der Widerrufsbelehrung (z. B. /rechtliches/widerruf). */
  withdrawal_policy_url?: string | null;
}

export interface OrderResult {
  subscriptionId: string;
  clientSecret: string | null;
  contractNumber: string;
  orderedAt: string;
  withdrawalUntil: string;
  confirmationSent: boolean;
}

export interface CancelPreview {
  possible: boolean;
  reason: string | null;
  contract_number: string | null;
  tier: string | null;
  tier_name: string | null;
  status: MembershipStatus | null;
  effective_at: string | null;
  immediate: boolean | null;
  name: string | null;
  email: string | null;
  kinds: ("ordentlich" | "ausserordentlich")[];
  entryLabel: string;
  buttonLabel: string;
}

export interface CancelResult {
  contractActionId: string;
  contractNumber: string;
  kind: "ordentlich" | "ausserordentlich";
  receivedAt: string;
  effectiveAt: string;
  immediate: boolean;
  stripe: "ok" | "failed" | "skipped";
  confirmationSent: boolean;
}

export interface WithdrawPreview {
  possible: boolean;
  reason: string | null;
  until: string | null;
  contractNumber: string | null;
  tierName: string | null;
  name: string | null;
  email: string | null;
  paidCents: number;
  eveningsUsed: number;
  valuePerEveningCents: number;
  wertersatzCents: number;
  refundCents: number;
  entryLabel: string;
  buttonLabel: string;
  legalStatus: string;
}

export interface WithdrawResult {
  contractActionId: string;
  contractNumber: string;
  receivedAt: string;
  paidCents: number;
  eveningsUsed: number;
  wertersatzCents: number;
  refundCents: number;
  refund: "ok" | "manual" | "none" | "pending";
  stripe: string;
  cancelledEvenings: number;
  confirmationSent: boolean;
}

/** Ergebnis einer Server Action: Daten oder ein maschinenlesbarer Fehler (hint der Datenbank bzw. Code der Function). */
export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string; message?: string };
