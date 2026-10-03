import "server-only";
import { createClient } from "@/lib/supabase/server";

/** Stand des zweiten Faktors: current = aal der Sitzung, next = aal2, sobald ein TOTP-Faktor bestätigt ist. */
export async function assurance(): Promise<{ current: string | null; next: string | null }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  return { current: data?.currentLevel ?? null, next: data?.nextLevel ?? null };
}
