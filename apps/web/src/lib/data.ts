// Daten für Server Components. Alles über RPC im Schema api (die Regeln liegen in der Datenbank).
import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AdminStatus, ConsentState, Facts, Identity, LegalDocument, Overview, PublicSettings } from "@/lib/types";

export const getSession = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = (data?.claims ?? null) as { sub: string; email?: string; aal?: string } | null;
  return { supabase, claims };
});

/** Angemeldete Person oder Weiterleitung zur Anmeldung. */
export async function requireSession(next = "/start") {
  const s = await getSession();
  if (!s.claims?.sub) redirect(`/anmelden?weiter=${encodeURIComponent(next)}`);
  return s as { supabase: Awaited<ReturnType<typeof createClient>>; claims: { sub: string; email?: string; aal?: string } };
}

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { supabase } = await getSession();
  const { data, error } = await supabase.schema("api").rpc(fn, args);
  if (error) throw Object.assign(new Error(`${fn}: ${error.message}`), { code: error.code, hint: error.hint });
  return data as T;
}

export const getOverview = cache(() => rpc<Overview>("my_overview"));
export const getFacts = cache(async () => ((await rpc<Facts[]>("my_facts")) ?? [])[0] ?? null);
export const getIdentity = cache(async () => ((await rpc<Identity[]>("my_identity")) ?? [])[0] ?? null);
export const getConsents = cache(() => rpc<ConsentState[]>("my_consents"));
export const getAdminStatus = cache(() => rpc<AdminStatus>("my_admin_status"));

export const getLegalDocument = cache(async (kind: string): Promise<LegalDocument | null> => {
  const rows = await rpc<LegalDocument[]>("legal_document", { p_kind: kind });
  return rows?.[0] ?? null;
});

export const getPublicSettings = cache(async (): Promise<PublicSettings> => {
  try {
    return (await rpc<PublicSettings>("public_settings")) ?? {};
  } catch {
    return {};
  }
});

/** Daten für den Mitgliederbereich (mit Konto). */
export async function requireMember(next = "/start") {
  const session = await requireSession(next);
  const overview = await getOverview();
  return { ...session, overview, form: overview.onboarding.address_form ?? "sie" } as const;
}

export interface OnboardingSettings {
  collect_street: boolean;
  min_age: number;
  required_consents: string[];
  verification_alternative_enabled: boolean;
}

export const getOnboardingSettings = cache(async () => (await rpc<OnboardingSettings | null>("onboarding_settings")) ?? {
  collect_street: false,
  min_age: 18,
  required_consents: [],
  verification_alternative_enabled: false,
});
