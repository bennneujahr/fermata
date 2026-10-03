// Antworten der RPC-Funktionen (Schema api). Von Hand gepflegt; Quelle: supabase/migrations/202610030002*.
import type { AddressForm } from "@/copy/form";

export type AccountStatus = "onboarding" | "active" | "paused" | "suspended" | "closed";
export type NextStep = "einwilligungen" | "angaben" | "identitaet" | "ausweis" | "fertig";
export type VerificationStatus = "started" | "approved" | "declined" | "in_review" | "expired" | "error" | "blocked";

export interface Onboarding {
  has_account: boolean;
  status?: AccountStatus;
  address_form?: AddressForm;
  is_founding_member?: boolean;
  created_at?: string;
  next_step?: NextStep;
  complete?: boolean;
  steps?: { key: string; state: "done" | "current" | "todo" }[];
  consents_ok?: boolean;
  facts_done?: boolean;
  identity_done?: boolean;
  verification?: {
    id: string;
    status: VerificationStatus;
    started_at: string;
    completed_at: string | null;
    is_adult: boolean | null;
    name_match: boolean | null;
    birth_date_match: boolean | null;
    verified: boolean;
  } | null;
  verification_attempts_left?: number;
}

export interface Overview {
  onboarding: Onboarding;
  first_name: string | null;
  membership: { status: string; tier: string | null; free_phase_ended_at: string | null } | null;
  available_evenings: number;
  is_admin_user: boolean;
  sanctions_active: boolean;
}

export interface Facts {
  first_name: string;
  last_name: string;
  birth_date: string;
  street: string | null;
  postal_code: string;
  city: string | null;
  phone: string | null;
}

export interface ConsentState {
  kind: string;
  required: boolean;
  granted: boolean;
  version: string | null;
  current_version: string | null;
  needs_renewal: boolean;
  at: string | null;
}

export interface LegalDocument {
  kind: string;
  version: string;
  status: "entwurf" | "geprueft" | "gueltig" | "abgeloest";
  title: string;
  body_markdown: string;
  valid_from: string | null;
}

export interface Identity {
  gender: string | null;
  seeking: string[] | null;
  orientation: string | null;
}

export interface PublicSettings {
  "safety.heimwegtelefon_number"?: string;
  "safety.heimwegtelefon_hours"?: string;
  "safety.emergency_number"?: string;
  "site.contact_email"?: string;
  "billing.tiers"?: Record<string, { name: string; price_cents: number; evenings: number }>;
  "verification.alternative_enabled"?: boolean;
  [key: string]: unknown;
}

export interface AdminStatus {
  is_admin_user: boolean;
  aal: "aal1" | "aal2";
  is_admin: boolean;
}

/** Fehler aus PostgREST (raise … using hint). */
export interface RpcError {
  code?: string;
  message: string;
  hint?: string | null;
  details?: string | null;
}
