// Verarbeitung der Stripe-Ereignisse. Die Regeln liegen in SQL (billing.apply_*); hier wird nur das
// Stripe-JSON gelesen. Unterstützt ältere API-Versionen (invoice.subscription, invoice.payment_intent,
// subscription.current_period_end) und neuere (invoice.parent.subscription_details, invoice.payments,
// items.data[].current_period_end).
import type { Sql } from "../db.ts";
import { rpc } from "./support.ts";

type Obj = Record<string, any>;

export interface EventOutcome {
  handled: boolean;
  type: string;
  userId?: string;
  /** Mails, die nach erfolgreicher Verarbeitung verschickt werden. */
  notify?: Array<
    | { kind: "activated"; userId: string; tier?: string; evenings: number; periodEnd: string }
    | { kind: "payment_failed"; userId: string; invoiceUrl?: string }
  >;
  detail?: unknown;
}

const id = (v: unknown): string | undefined =>
  typeof v === "string" ? v : v && typeof v === "object" && typeof (v as Obj).id === "string" ? (v as Obj).id : undefined;
const ts = (v: unknown): string | null => (typeof v === "number" ? new Date(v * 1000).toISOString() : null);

export function invoiceSubscriptionId(inv: Obj): string | undefined {
  return id(inv.subscription) ?? id(inv.parent?.subscription_details?.subscription) ??
    id(inv.lines?.data?.[0]?.subscription) ?? id(inv.lines?.data?.[0]?.parent?.subscription_item_details?.subscription);
}

export function invoicePeriod(inv: Obj): { start: string | null; end: string | null } {
  // Bei Abo-Rechnungen gilt der Zeitraum der Rechnungsposition (invoice.period_* ist der Vorzeitraum).
  const line = (inv.lines?.data ?? []).find((l: Obj) => l?.period?.start && l?.period?.end);
  return { start: ts(line?.period?.start ?? inv.period_start), end: ts(line?.period?.end ?? inv.period_end) };
}

export function invoicePaymentIntent(inv: Obj): string | undefined {
  return id(inv.payment_intent) ??
    id((inv.payments?.data ?? []).find((p: Obj) => p?.payment?.payment_intent)?.payment?.payment_intent);
}

function metaUser(inv: Obj): string | null {
  const m = inv.parent?.subscription_details?.metadata ?? inv.subscription_details?.metadata ?? {};
  const v = m.fermata_user_id;
  return typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v) ? v : null;
}

export function subscriptionPeriodEnd(sub: Obj): string | null {
  return ts(sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end);
}

// Datensparsamkeit: Diese Felder speichern wir nie (Kartendetails, Anschriften, Telefonnummern, Namen, E-Mail-Adressen,
// Rechnungslinks). Dieselbe Liste wendet die Datenbank noch einmal an (billing.stripe_strip_personal,
// 20261003000905_retention.sql); nach retention.stripe_events_months wird das Ereignis gelöscht.
export const DROP_KEYS = new Set([
  "payment_method_details", "card", "billing_details", "customer_address", "customer_shipping", "customer_phone",
  "customer_name", "customer_email", "customer_details", "customer_tax_ids", "account_tax_ids", "shipping",
  "shipping_details", "address", "phone", "email", "name", "receipt_email", "receipt_url", "receipt_number",
  "hosted_invoice_url", "invoice_pdf", "sources", "payment_method", "default_payment_method", "ip", "ip_address",
  "client_ip", "billing_address", "fingerprint",
]);

/** Kopie des Ereignisses ohne Karten- und Adressdaten, wie sie in billing.stripe_events gespeichert wird. */
export function minimizeEvent<T>(value: T, depth = 0): T {
  if (depth > 12 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => minimizeEvent(v, depth + 1)) as T;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (DROP_KEYS.has(k)) continue;
    out[k] = minimizeEvent(v, depth + 1);
  }
  return out as T;
}

export async function processStripeEvent(sql: Sql, event: Obj): Promise<EventOutcome> {
  const type = String(event.type);
  const obj: Obj = event.data?.object ?? {};
  switch (type) {
    case "invoice.paid": {
      const sub = invoiceSubscriptionId(obj);
      const period = invoicePeriod(obj);
      if (!sub || !period.start || !period.end) return { handled: false, type, detail: "keine Abo-Rechnung" };
      const [row] = await rpc(sql`
        select billing.apply_invoice_paid(${sub}, ${id(obj.customer) ?? null}, ${String(obj.id)}, ${period.start}::timestamptz,
          ${period.end}::timestamptz, ${Number(obj.amount_paid ?? 0)}::integer, ${invoicePaymentIntent(obj) ?? null},
          ${id(obj.charge) ?? null}, ${metaUser(obj)}::uuid) as r`);
      const r = row!.r as Obj;
      const out: EventOutcome = { handled: Boolean(r.handled), type, userId: r.user_id, detail: r };
      if (r.handled && r.first_period && !r.duplicate) {
        out.notify = [{ kind: "activated", userId: r.user_id, tier: r.tier, evenings: Number(r.evenings ?? 0), periodEnd: period.end }];
      }
      return out;
    }
    case "invoice.payment_failed": {
      const sub = invoiceSubscriptionId(obj);
      const [row] = await rpc(sql`
        select billing.apply_payment_failed(${sub ?? null}, ${id(obj.customer) ?? null}, ${String(obj.id)}, ${String(event.id)}) as r`);
      const r = row!.r as Obj;
      const out: EventOutcome = { handled: Boolean(r.handled), type, userId: r.user_id, detail: r };
      if (r.handled && r.notify) {
        out.notify = [{ kind: "payment_failed", userId: r.user_id, invoiceUrl: typeof obj.hosted_invoice_url === "string" ? obj.hosted_invoice_url : undefined }];
      }
      return out;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const cancelAt = ts(obj.cancel_at);
      const [row] = await rpc(sql`
        select billing.apply_subscription_state(${String(obj.id)}, ${id(obj.customer) ?? null}, ${String(obj.status ?? "")},
          ${Boolean(obj.cancel_at_period_end)}, ${cancelAt}::timestamptz, ${subscriptionPeriodEnd(obj)}::timestamptz,
          ${type === "customer.subscription.deleted"}) as r`);
      const r = row!.r as Obj;
      return { handled: Boolean(r.handled), type, userId: r.user_id, detail: r };
    }
    default:
      // z. B. invoice.payment_succeeded (doppelt zu invoice.paid), payment_intent.*, checkout.session.*:
      // werden gespeichert, aber nicht ausgewertet.
      return { handled: false, type, detail: "nicht ausgewertet" };
  }
}
