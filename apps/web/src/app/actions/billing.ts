"use server";
// Mitgliedschaft: Bestellung (billing-checkout), Kündigungsknopf (billing-cancel), Widerrufsbutton (billing-withdraw).
// Angemeldet mit dem Token der Person (preview/confirm), ohne Anmeldung über request (Link per Mail, confirm_link).
// Die Regeln entscheiden die Edge Functions und die Datenbank; hier wird nur weitergereicht.
// Bewusst ohne revalidatePath: Die Seiten laden ihre Daten bei jedem Aufruf neu, und die Eingangsbestätigung
// soll stehen bleiben (ein Neuaufbau würde sie durch „bereits gekündigt“ ersetzen).
import type { ActionResult, CancelResult, OrderResult, WithdrawResult } from "@/lib/billing-types";
import { callFunction } from "@/lib/functions";
import { callPublicFunction } from "@/lib/public-functions";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(error: string | null, status: number): { ok: false; error: string } {
  return { ok: false, error: error ?? (status >= 500 ? "payment_provider_error" : "generic") };
}

/**
 * Klick auf „Mitgliedschaft zahlungspflichtig abschließen“: billing-checkout {action: "order"} mit dem Hash der
 * gezeigten Übersicht und start_request: true (Häkchen „vorzeitiger Beginn“, Vertrag mit der Härtung).
 */
export async function orderMembership(input: {
  tier: string;
  summaryHash: string;
  requestId: string;
  startRequest: boolean;
}): Promise<ActionResult<OrderResult>> {
  if (!input.startRequest) return { ok: false, error: "start_request_required" };
  if (!/^[a-z]{2,20}$/.test(input.tier) || !/^[0-9a-f]{64}$/.test(input.summaryHash)) return { ok: false, error: "invalid_tier" };
  const res = await callFunction<OrderResult>("billing-checkout", {
    body: {
      action: "order",
      tier: input.tier,
      summaryHash: input.summaryHash,
      requestId: UUID.test(input.requestId) ? input.requestId : undefined,
      start_request: true,
    },
  });
  if (!res.ok || !res.data) return fail(res.error, res.status);
  return { ok: true, data: res.data };
}

// ---------------------------------------------------------------------------
// Kündigen (§ 312k BGB)
// ---------------------------------------------------------------------------

export async function cancelMembership(input: {
  kind: "ordentlich" | "ausserordentlich";
  reason?: string;
  name?: string;
  contactEmail?: string;
}): Promise<ActionResult<CancelResult>> {
  const kind = input.kind === "ausserordentlich" ? "ausserordentlich" : "ordentlich";
  const reason = input.reason?.trim() || undefined;
  if (kind === "ausserordentlich" && (!reason || reason.length < 3)) return { ok: false, error: "reason_required" };
  const res = await callFunction<CancelResult>("billing-cancel", {
    body: { action: "confirm", kind, reason, name: input.name?.trim() || undefined, contactEmail: input.contactEmail?.trim() || undefined },
  });
  if (!res.ok || !res.data) return fail(res.error, res.status);
  return { ok: true, data: res.data };
}

/** Ohne Anmeldung: Antwort ist immer gleich (niemand erfährt, ob es den Vertrag gibt). */
export async function requestCancellation(input: {
  name: string;
  email: string;
  contractNumber: string;
  kind: "ordentlich" | "ausserordentlich";
  reason?: string;
}): Promise<ActionResult<{ sentAt: string }>> {
  const kind = input.kind === "ausserordentlich" ? "ausserordentlich" : "ordentlich";
  const reason = input.reason?.trim() || undefined;
  if (!input.name?.trim() || input.name.trim().length < 2) return { ok: false, error: "name_required" };
  if (kind === "ausserordentlich" && (!reason || reason.length < 3)) return { ok: false, error: "reason_required" };
  const sentAt = new Date().toISOString();
  const res = await callPublicFunction("billing-cancel", {
    body: {
      action: "request",
      email: input.email.trim(),
      contractNumber: input.contractNumber.trim().toUpperCase(),
      kind,
      reason,
      name: input.name.trim(),
    },
  });
  if (!res.ok) return fail(res.error, res.status);
  return { ok: true, data: { sentAt } };
}

// ---------------------------------------------------------------------------
// Widerrufen (§ 356a BGB)
// ---------------------------------------------------------------------------

export async function withdrawMembership(input: {
  name: string;
  contractNumber: string;
  contactEmail?: string;
}): Promise<ActionResult<WithdrawResult>> {
  if (!input.name?.trim() || input.name.trim().length < 2) return { ok: false, error: "name_required" };
  if (!input.contractNumber?.trim()) return { ok: false, error: "contract_required" };
  const res = await callFunction<WithdrawResult>("billing-withdraw", {
    body: {
      action: "confirm",
      name: input.name.trim(),
      contractNumber: input.contractNumber.trim().toUpperCase(),
      contactEmail: input.contactEmail?.trim() || undefined,
    },
  });
  if (!res.ok || !res.data) return fail(res.error, res.status);
  return { ok: true, data: res.data };
}

export async function requestWithdrawal(input: { name: string; email: string; contractNumber: string }): Promise<ActionResult<{ sentAt: string }>> {
  if (!input.name?.trim() || input.name.trim().length < 2) return { ok: false, error: "name_required" };
  const sentAt = new Date().toISOString();
  const res = await callPublicFunction("billing-withdraw", {
    body: {
      action: "request",
      email: input.email.trim(),
      contractNumber: input.contractNumber.trim().toUpperCase(),
      name: input.name.trim(),
    },
  });
  if (!res.ok) return fail(res.error, res.status);
  return { ok: true, data: { sentAt } };
}

// ---------------------------------------------------------------------------
// Bestätigungslink aus der Mail (ohne Anmeldung): /kuendigen/bestaetigen#t=… und /widerrufen/bestaetigen#t=…
// Öffnen zeigt nur den Vertrag; erst der Knopf führt aus (Link-Vorschauen in Mailprogrammen lösen nichts aus).
// ---------------------------------------------------------------------------

const LINK_TOKEN = /^[A-Za-z0-9_.=%-]{8,256}$/;

export interface ContractLinkInfo {
  valid: boolean;
  contractNumber: string | null;
  requestedAt: string | null;
}

function linkFunction(kind: "cancel" | "withdraw"): string {
  return kind === "cancel" ? "billing-cancel" : "billing-withdraw";
}

export async function loadContractLink(kind: "cancel" | "withdraw", token: string): Promise<ActionResult<ContractLinkInfo>> {
  if (!LINK_TOKEN.test(token)) return { ok: true, data: { valid: false, contractNumber: null, requestedAt: null } };
  const res = await callPublicFunction<{ valid?: boolean; contract_number?: string; requested_at?: string }>(linkFunction(kind), {
    method: "GET",
    query: { t: token },
  });
  if (res.status === 404 || res.status === 400) return { ok: true, data: { valid: false, contractNumber: null, requestedAt: null } };
  if (!res.ok || !res.data) return fail(res.error, res.status);
  return {
    ok: true,
    data: { valid: res.data.valid === true, contractNumber: res.data.contract_number ?? null, requestedAt: res.data.requested_at ?? null },
  };
}

export async function confirmContractLink(
  kind: "cancel" | "withdraw",
  token: string,
): Promise<ActionResult<{ contractNumber: string | null; receivedAt: string | null; effectiveAt: string | null }>> {
  if (!LINK_TOKEN.test(token)) return { ok: false, error: "invalid_link" };
  const res = await callPublicFunction<{ contractNumber?: string; receivedAt?: string; effectiveAt?: string }>(linkFunction(kind), {
    method: "POST",
    body: { action: "confirm_link", t: token },
  });
  if (res.status === 404) return { ok: false, error: "invalid_link" };
  if (!res.ok || !res.data) return fail(res.error, res.status);
  return {
    ok: true,
    data: { contractNumber: res.data.contractNumber ?? null, receivedAt: res.data.receivedAt ?? null, effectiveAt: res.data.effectiveAt ?? null },
  };
}
