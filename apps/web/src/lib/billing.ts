// Daten der Mitgliedschaft für Server Components (RPC im Schema api, eigene Zeilen in billing.contract_actions).
import "server-only";
import { cache } from "react";
import { getSession } from "@/lib/data";
import type { BillingOverview, CancelPreview, ContractAction, OrderSummary, Tier, WithdrawPreview } from "@/lib/billing-types";
import { callFunction } from "@/lib/functions";

export { hasRunningMembership, nextBillingDate } from "@/lib/billing-rules";

export class RpcFailure extends Error {
  constructor(public fn: string, public code: string | undefined, public hint: string | undefined, message: string) {
    super(`${fn}: ${message}`);
  }
}

export async function apiRpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { supabase } = await getSession();
  const { data, error } = await supabase.schema("api").rpc(fn, args);
  if (error) throw new RpcFailure(fn, error.code, error.hint ?? undefined, error.message);
  return data as T;
}

export const getBillingOverview = cache(() => apiRpc<BillingOverview>("billing_overview"));

export const getTiers = cache(async (): Promise<Tier[]> => {
  try {
    return (await apiRpc<Tier[]>("billing_tiers")) ?? [];
  } catch {
    return [];
  }
});

/** Bestellübersicht oder der Fehlercode (invalid_tier, tier_not_orderable). */
export async function getOrderSummary(tier: string): Promise<{ summary: OrderSummary } | { error: string }> {
  try {
    return { summary: await apiRpc<OrderSummary>("billing_order_summary", { p_tier: tier }) };
  } catch (e) {
    return { error: e instanceof RpcFailure ? (e.hint ?? "generic") : "generic" };
  }
}

/**
 * Verlauf der Vertragserklärungen (Bestellung, Kündigung, Widerruf). Bevorzugt aus api.billing_overview().history,
 * sonst direkt aus billing.contract_actions (RLS: nur eigene Zeilen).
 */
export async function getContractHistory(overview: BillingOverview): Promise<ContractAction[] | null> {
  if (Array.isArray(overview.history)) return overview.history;
  const { supabase } = await getSession();
  const { data, error } = await supabase
    .schema("billing")
    .from("contract_actions")
    .select("id, kind, at, effective_at, confirmation_sent_at, details")
    .order("at", { ascending: false })
    .limit(50);
  if (error || !data) return null;
  return (data as (Omit<ContractAction, "contract_number"> & { details: { contract_number?: string } | null })[]).map((r) => ({
    id: r.id,
    kind: r.kind,
    at: r.at,
    effective_at: r.effective_at,
    confirmation_sent_at: r.confirmation_sent_at,
    contract_number: r.details?.contract_number ?? null,
  }));
}

/** Schritt 1 der Kündigung (billing-cancel, action preview): Vertrag, Name, E-Mail, Wirksamkeit. */
export async function getCancelPreview(): Promise<{ preview: CancelPreview } | { error: string }> {
  const res = await callFunction<CancelPreview>("billing-cancel", { body: { action: "preview" } });
  return res.ok && res.data ? { preview: res.data } : { error: res.error ?? "generic" };
}

/** Schritt 1 des Widerrufs (billing-withdraw, action preview): Frist, Vertrag, Berechnung. */
export async function getWithdrawPreview(): Promise<{ preview: WithdrawPreview } | { error: string }> {
  const res = await callFunction<WithdrawPreview>("billing-withdraw", { body: { action: "preview" } });
  return res.ok && res.data ? { preview: res.data } : { error: res.error ?? "generic" };
}
