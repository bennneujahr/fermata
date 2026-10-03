// Kündigung (§ 312k BGB) und Widerruf (§ 356a BGB) ausführen: Erklärung speichern (Zeitpunkt des Eingangs),
// bei Stripe umsetzen, Ergebnis vermerken, Eingangsbestätigung per Mail schicken.
// Schlägt Stripe fehl, bleibt die Erklärung gültig; das Ergebnis steht in billing.contract_actions.result
// und Benn bekommt einen Hinweis.
import type { Sql } from "../db.ts";
import { appUrl, optionalEnv } from "../env.ts";
import { HttpError } from "../http.ts";
import { sendMail } from "../mail/mod.ts";
import { cancelConfirmation, contractLink, withdrawReceipt } from "../mail/templates/billing.ts";
import { stripe } from "./client.ts";
import { invoicePaymentIntent } from "./events.ts";
import { isEmail, LABELS, rpc, str } from "./support.ts";

type Obj = Record<string, any>;

export async function userContact(sql: Sql, userId: string): Promise<{ email?: string; firstName?: string; name?: string }> {
  const [row] = await sql`
    select u.email::text as email, f.first_name, trim(coalesce(f.first_name, '') || ' ' || coalesce(f.last_name, '')) as name
    from auth.users u left join private.account_facts f on f.user_id = u.id where u.id = ${userId}::uuid`;
  return { email: row?.email ?? undefined, firstName: row?.first_name ?? undefined, name: row?.name || undefined };
}

async function audit(sql: Sql, action: string, targetId: string, details: Obj): Promise<void> {
  await sql`select ops.audit(${action}, 'billing.contract_actions', ${targetId}, ${sql.json(details as any)}::jsonb)`;
}

async function alertAdmin(sql: Sql, kind: string, details: Obj): Promise<void> {
  await sql`select safety.enqueue_mail(null, true, 'safety.admin_alert', ${sql.json({ kind, severity: "mittel", ...details } as any)}::jsonb)`;
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message.slice(0, 300) : String(err).slice(0, 300);
}

// ---------------------------------------------------------------------------
// Kündigung
// ---------------------------------------------------------------------------
export interface CancelDetails {
  kind: "ordentlich" | "ausserordentlich";
  reason?: string;
  name?: string;
  contact_email?: string;
  channel: "angemeldet" | "ohne_anmeldung";
  requested_at?: string;
}

export function parseCancelInput(body: Obj, channel: CancelDetails["channel"]): CancelDetails {
  const kind = body.kind === "ausserordentlich" ? "ausserordentlich" : "ordentlich";
  const contact = str(body.contactEmail ?? body.contact_email, 254);
  if (contact !== undefined && !isEmail(contact)) throw new HttpError(400, "invalid_email", "Bitte geben Sie eine gültige E-Mail-Adresse an.");
  return { kind, reason: str(body.reason, 1000), name: str(body.name, 160), contact_email: contact, channel };
}

export async function executeCancellation(sql: Sql, userId: string, details: CancelDetails): Promise<Obj> {
  const [row] = await rpc(sql`select billing.record_cancellation(${userId}::uuid, ${sql.json(details as any)}::jsonb) as r`);
  const r = row!.r as Obj;
  const actionId = String(r.contract_action_id);
  let stripeResult: Obj = { status: "skipped" };
  if (r.stripe_subscription_id) {
    try {
      if (r.immediate) {
        await stripe().request("DELETE", `/v1/subscriptions/${r.stripe_subscription_id}`);
      } else {
        await stripe().request("POST", `/v1/subscriptions/${r.stripe_subscription_id}`, {
          cancel_at_period_end: true,
          metadata: { fermata_cancel_action: actionId },
        }, { idempotencyKey: `fermata-cancel-${actionId}` });
      }
      stripeResult = { status: "ok", at: new Date().toISOString() };
    } catch (err) {
      stripeResult = { status: "failed", error: errorText(err) };
      await audit(sql, "billing.stripe_cancel_failed", actionId, stripeResult);
      await alertAdmin(sql, "kuendigung_stripe_fehler", { contract_number: r.contract_number });
    }
  }
  await sql`select billing.set_contract_result(${actionId}::uuid, ${sql.json({ stripe: stripeResult } as any)}::jsonb)`;

  const contact = await userContact(sql, userId);
  const to = details.contact_email ?? contact.email;
  let confirmationSent = false;
  if (to) {
    try {
      const msg = cancelConfirmation({
        receivedAt: r.received_at, effectiveAt: r.effective_at, contractNumber: r.contract_number,
        kind: details.kind, reason: details.reason, name: details.name ?? contact.name, immediate: Boolean(r.immediate),
      });
      const sent = await sendMail({ to, ...msg }, userId);
      await sql`select billing.mark_confirmation_sent(${actionId}::uuid, ${sent.id})`;
      confirmationSent = true;
    } catch (err) {
      await audit(sql, "billing.confirmation_mail_failed", actionId, { error: errorText(err) });
    }
  }
  return {
    contractActionId: actionId, contractNumber: r.contract_number, kind: details.kind,
    receivedAt: r.received_at, effectiveAt: r.effective_at, immediate: Boolean(r.immediate),
    stripe: stripeResult.status, confirmationSent,
  };
}

// ---------------------------------------------------------------------------
// Widerruf
// ---------------------------------------------------------------------------
export interface WithdrawDetails {
  name: string;
  contract_number: string;
  contact_email?: string;
  channel: "angemeldet" | "ohne_anmeldung";
  requested_at?: string;
}

export function parseWithdrawInput(body: Obj, channel: WithdrawDetails["channel"]): WithdrawDetails {
  const name = str(body.name, 160);
  const contractNumber = str(body.contractNumber ?? body.contract_number, 40);
  const contact = str(body.contactEmail ?? body.contact_email, 254);
  if (!name || name.length < 2) throw new HttpError(400, "name_required", "Bitte geben Sie Ihren Namen an.");
  if (!contractNumber) throw new HttpError(400, "contract_required", "Bitte geben Sie Ihre Vertragsnummer an.");
  if (contact !== undefined && !isEmail(contact)) throw new HttpError(400, "invalid_email", "Bitte geben Sie eine gültige E-Mail-Adresse an.");
  return { name, contract_number: contractNumber.toUpperCase(), contact_email: contact, channel };
}

export async function executeWithdrawal(
  sql: Sql,
  userId: string,
  details: WithdrawDetails,
  afterRecord?: () => Promise<void>,
): Promise<Obj> {
  const [row] = await rpc(sql`select billing.record_withdrawal(${userId}::uuid, ${sql.json(details as any)}::jsonb) as r`);
  const r = row!.r as Obj;
  const actionId = String(r.contract_action_id);
  const s = stripe();
  let cancelResult: Obj = { status: "skipped" };
  if (r.stripe_subscription_id) {
    try {
      await s.request("DELETE", `/v1/subscriptions/${r.stripe_subscription_id}`);
      cancelResult = { status: "ok" };
    } catch (err) {
      cancelResult = { status: "failed", error: errorText(err) };
    }
  }
  const refundCents = Number(r.refund_cents ?? 0);
  let refundResult: Obj = { status: refundCents > 0 ? "pending" : "none", amount_cents: refundCents };
  if (refundCents > 0) {
    try {
      let pi: string | undefined = r.stripe_payment_intent_id ?? undefined;
      let charge: string | undefined = r.stripe_charge_id ?? undefined;
      if (!pi && !charge && r.stripe_invoice_id) {
        const inv = await s.request<Obj>("GET", `/v1/invoices/${r.stripe_invoice_id}`, { expand: ["payments"] });
        pi = invoicePaymentIntent(inv);
        charge = typeof inv.charge === "string" ? inv.charge : undefined;
      }
      if (!pi && !charge) throw new Error("Zahlung zur Erstattung nicht gefunden");
      const refund = await s.request<Obj>("POST", "/v1/refunds", {
        ...(pi ? { payment_intent: pi } : { charge }),
        amount: refundCents,
        reason: "requested_by_customer",
        metadata: { fermata_contract_action: actionId, fermata_reason: "widerruf" },
      }, { idempotencyKey: `fermata-refund-${actionId}` });
      refundResult = { status: "ok", amount_cents: refundCents, refund_id: refund.id };
    } catch (err) {
      refundResult = { status: "manual", amount_cents: refundCents, error: errorText(err) };
    }
  }
  await sql`select billing.set_contract_result(${actionId}::uuid, ${sql.json({ stripe_cancel: cancelResult, refund: refundResult } as any)}::jsonb)`;
  if (cancelResult.status === "failed" || refundResult.status === "manual") {
    await audit(sql, "billing.withdraw_needs_manual_step", actionId, { cancel: cancelResult, refund: refundResult });
    await alertAdmin(sql, "widerruf_von_hand", { contract_number: r.contract_number });
  }

  const contact = await userContact(sql, userId);
  const to = details.contact_email ?? contact.email;
  let confirmationSent = false;
  if (to) {
    try {
      const msg = withdrawReceipt({
        receivedAt: r.received_at, contractNumber: r.contract_number, name: details.name,
        paidCents: Number(r.paid_cents ?? 0), eveningsUsed: Number(r.evenings_used ?? 0),
        wertersatzCents: Number(r.wertersatz_cents ?? 0), refundCents,
        refundStatus: refundCents <= 0 ? "keine" : refundResult.status === "ok" ? "erstattet" : "in_bearbeitung",
      });
      const sent = await sendMail({ to, ...msg }, userId);
      await sql`select billing.mark_confirmation_sent(${actionId}::uuid, ${sent.id})`;
      confirmationSent = true;
    } catch (err) {
      await audit(sql, "billing.confirmation_mail_failed", actionId, { error: errorText(err) });
    }
  }
  if (afterRecord) {
    try {
      await afterRecord();
    } catch (err) {
      console.error(JSON.stringify({ level: "warn", msg: "Nachgelagerter Schritt fehlgeschlagen", error: errorText(err) }));
    }
  }
  return {
    contractActionId: actionId, contractNumber: r.contract_number, receivedAt: r.received_at,
    paidCents: Number(r.paid_cents ?? 0), eveningsUsed: Number(r.evenings_used ?? 0),
    wertersatzCents: Number(r.wertersatz_cents ?? 0), refundCents, refund: refundResult.status,
    stripe: cancelResult.status, cancelledEvenings: Number(r.cancelled_evenings ?? 0), confirmationSent,
  };
}

// ---------------------------------------------------------------------------
// Ohne Anmeldung: Formular → Mail mit Link
// ---------------------------------------------------------------------------
export const GENERIC_REQUEST_ANSWER =
  "Wenn die Angaben zu einem Vertrag passen, erhalten Sie gleich eine E-Mail mit einem Bestätigungslink. Als Eingang gilt der jetzige Zeitpunkt.";

export function functionUrl(req: Request, name: string): string {
  const base = optionalEnv("FERMATA_FUNCTIONS_URL");
  if (base) return `${base.replace(/\/$/, "")}/${name}`;
  const u = new URL(req.url);
  return `${u.origin}${u.pathname}`;
}

export async function requestContractLink(
  req: Request,
  sql: Sql,
  kind: "cancel" | "withdraw",
  body: Obj,
): Promise<{ sent: boolean }> {
  const email = str(body.email, 254);
  const contractNumber = str(body.contractNumber ?? body.contract_number, 40);
  if (!isEmail(email) || !contractNumber) {
    throw new HttpError(400, "invalid_input", "Bitte geben Sie Ihre E-Mail-Adresse und Ihre Vertragsnummer an.");
  }
  const details = kind === "cancel"
    ? parseCancelInput(body, "ohne_anmeldung")
    : parseWithdrawInput({ ...body, contractNumber }, "ohne_anmeldung");
  if (kind === "cancel" && (details as CancelDetails).kind === "ausserordentlich" && !(details as CancelDetails).reason) {
    throw new HttpError(400, "reason_required", "Bitte nennen Sie bei einer außerordentlichen Kündigung den Grund.");
  }
  const [row] = await rpc(sql`
    select billing.create_contract_request(${kind}, ${email}, ${contractNumber}, ${sql.json(details as any)}::jsonb) as r`);
  const r = row?.r as Obj | null;
  if (!r?.token) return { sent: false };
  const url = `${functionUrl(req, kind === "cancel" ? "billing-cancel" : "billing-withdraw")}?t=${encodeURIComponent(r.token)}`;
  const msg = contractLink({ kind, url, requestedAt: r.requested_at, expiresAt: r.expires_at, contractNumber: contractNumber.toUpperCase() });
  await sendMail({ to: email, ...msg }, r.user_id);
  return { sent: true };
}

export async function consumeContractLink(sql: Sql, token: string, kind: "cancel" | "withdraw"): Promise<{ userId: string; details: Obj; requestId: string }> {
  const [peek] = await sql`select billing.peek_contract_request(${token}) as p`;
  if (!peek?.p || peek.p.kind !== kind || !peek.p.valid) throw new HttpError(404, "invalid_link", "Der Link ist nicht mehr gültig.");
  const [row] = await rpc(sql`select billing.consume_contract_request(${token}) as r`);
  const r = row!.r as Obj;
  return { userId: r.user_id, details: r.details, requestId: r.request_id };
}

export function manageUrl(): string {
  return `${appUrl()}/konto/mitgliedschaft`;
}

export { LABELS };
