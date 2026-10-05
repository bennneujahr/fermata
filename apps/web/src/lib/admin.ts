// Admin-Daten (RPC im Schema api, jede Funktion prüft app.is_admin() = Admin mit aal2).
import "server-only";
import { createClient } from "@/lib/supabase/server";

export async function adminRpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const supabase = await createClient();
  const { data, error } = await supabase.schema("api").rpc(fn, args);
  if (error) throw Object.assign(new Error(`${fn}: ${error.message}`), { code: error.code, hint: error.hint });
  return data as T;
}

export interface AdminOverview {
  accounts: Record<string, number>;
  accounts_total: number;
  invitations: { open: number; accepted: number; expired: number };
  verifications: Record<string, number>;
  verifications_pending_deletion: number;
  safety_flags_open: number;
  reports_open: number;
  waitlist: { total: number; invited_to_app: number } | null;
}

export interface AdminAccountRow {
  user_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  postal_code: string | null;
  city: string | null;
  status: string;
  is_founding_member: boolean;
  created_at: string;
  last_sign_in_at: string | null;
  next_step: string | null;
  verification_status: string | null;
  invitation_expires_at: string | null;
  invitation_accepted_at: string | null;
}

export interface AdminInvitationRow {
  id: string;
  email: string;
  user_id: string | null;
  invited_at: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  waitlist_linked: boolean;
  state: string;
}

export interface AdminVerificationRow {
  id: string;
  user_id: string;
  email: string;
  provider: string;
  status: string;
  is_adult: boolean | null;
  birth_year: number | null;
  name_match: boolean | null;
  birth_date_match: boolean | null;
  blocklist_hit: boolean;
  started_at: string;
  completed_at: string | null;
  provider_session_deleted_at: string | null;
}

export interface AdminFlagRow {
  id: string;
  user_id: string | null;
  email: string | null;
  source: string;
  kind: string;
  severity: string;
  details: Record<string, unknown>;
  created_at: string;
  reviewed_at: string | null;
  outcome: string | null;
}

export interface AdminSettingRow {
  key: string;
  value: unknown;
  description: string;
  category: string;
  is_public: boolean;
  updated_at: string;
  updated_by: string | null;
}
