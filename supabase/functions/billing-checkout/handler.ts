// Bestellung einer Mitgliedschaft (PLAN 2.3 Nr. 7). Ablauf in der Web-App:
//   1. POST {action:"summary", tier}  → Bestellübersicht (Preis, USt, Laufzeit, Kündigung, Widerruf, Knopftext) + summaryHash
//   2. Stripe Payment Element im Modus „Abo“ ohne Client-Geheimnis zeigen (deferred intent)
//   3. Klick auf „Mitgliedschaft zahlungspflichtig abschließen“ → POST {action:"order", tier, summaryHash, requestId}
//      → Kunde anlegen/wiederverwenden, Abo mit payment_behavior=default_incomplete anlegen, Bestellung speichern,
//        Eingangsbestätigung per Mail → Antwort mit clientSecret
//   4. Web-App ruft stripe.confirmPayment({clientSecret}) auf; den Rest erledigt stripe-webhook.
import { db } from "../_shared/db.ts";
import { optionalEnv } from "../_shared/env.ts";
import { handler, HttpError, json, readJson } from "../_shared/http.ts";
import { sendMail } from "../_shared/mail/mod.ts";
import { orderReceived } from "../_shared/mail/templates/billing.ts";
import { stripe, StripeError } from "../_shared/stripe/client.ts";
import { manageUrl } from "../_shared/stripe/contract.ts";
import { requireMember } from "../_shared/stripe/member-auth.ts";
import { ensurePrice, type TierConfig } from "../_shared/stripe/prices.ts";
import { LABELS, rpc, str } from "../_shared/stripe/support.ts";

type Obj = Record<string, any>;

export default handler(["POST"], async (req) => {
  const member = await requireMember(req);
  const body = await readJson<Obj>(req);
  const action = body.action === "order" ? "order" : "summary";
  const tier = str(body.tier, 20) ?? "";
  const sql = db();

  const [s] = await rpc(sql`select billing.order_summary(${tier}) as summary, billing.tier_config(${tier}) as tier_config`);
  const summary = s!.summary as Obj;
  const [h] = await sql`select billing.summary_hash(${sql.json(summary as any)}::jsonb) as hash`;
  const summaryHash = String(h!.hash);

  if (action === "summary") {
    return json(req, {
      summary,
      summaryHash,
      buttonLabel: LABELS.orderButton,
      publishableKey: optionalEnv("STRIPE_PUBLISHABLE_KEY") ?? null,
      payment: { mode: "subscription", amount: summary.price_cents, currency: summary.currency },
    });
  }

  // --- Bestellung (Klick auf den Bestellknopf) ---
  if (body.summaryHash !== summaryHash) {
    throw new HttpError(409, "summary_changed", "Die Bestellübersicht hat sich geändert. Bitte laden Sie die Seite neu.");
  }
  await rpc(sql`select billing.order_precheck(${member.id}::uuid)`);
  const [m] = await sql`
    select u.email::text as email, m.stripe_customer_id, m.stripe_subscription_id, m.status,
           ops.setting_text('landing.vat_mode') as vat_mode
    from auth.users u left join billing.memberships m on m.user_id = u.id where u.id = ${member.id}::uuid`;
  if (!m?.email) throw new HttpError(404, "user_not_found", "Konto nicht gefunden.");
  const requestId = typeof body.requestId === "string" && /^[0-9a-f-]{36}$/i.test(body.requestId) ? body.requestId : crypto.randomUUID();
  const client = stripe();

  let subscription: Obj;
  let customerId: string = m.stripe_customer_id;
  try {
    if (!customerId) {
      const customer = await client.request<Obj>("POST", "/v1/customers", {
        email: m.email,
        metadata: { fermata_user_id: member.id },
      }, { idempotencyKey: `fermata-customer-${member.id}` });
      customerId = customer.id;
    }
    if (m.status === "pending" && m.stripe_subscription_id) {
      // Eine frühere, nicht bezahlte Bestellung wird ersetzt.
      await client.request("DELETE", `/v1/subscriptions/${m.stripe_subscription_id}`).catch(() => undefined);
    }
    const priceId = await ensurePrice(client, s!.tier_config as TierConfig, String(m.vat_mode ?? "inkl_ust"));
    subscription = await client.request<Obj>("POST", "/v1/subscriptions", {
      customer: customerId,
      items: [{ price: priceId }],
      payment_behavior: "default_incomplete",
      payment_settings: { save_default_payment_method: "on_subscription" },
      expand: [client.usesConfirmationSecret() ? "latest_invoice.confirmation_secret" : "latest_invoice.payment_intent"],
      metadata: { fermata_user_id: member.id, fermata_tier: tier },
    }, { idempotencyKey: `fermata-subscription-${member.id}-${requestId}` });
  } catch (err) {
    if (err instanceof StripeError) {
      console.error(JSON.stringify({ level: "error", msg: "Stripe bei Bestellung", status: err.status, type: err.type, code: err.code }));
      throw new HttpError(502, "payment_provider_error", "Die Zahlung kann gerade nicht vorbereitet werden. Bitte versuchen Sie es gleich noch einmal.");
    }
    throw err;
  }
  const invoice = (subscription.latest_invoice ?? {}) as Obj;
  const clientSecret: string | null = invoice.confirmation_secret?.client_secret ?? invoice.payment_intent?.client_secret ??
    subscription.pending_setup_intent?.client_secret ?? null;

  let order: Obj;
  try {
    const [o] = await rpc(sql`
      select billing.record_order(${member.id}::uuid, ${tier}, ${sql.json(summary as any)}::jsonb, ${customerId}, ${subscription.id}, 'web') as r`);
    order = o!.r as Obj;
  } catch (err) {
    await client.request("DELETE", `/v1/subscriptions/${subscription.id}`).catch(() => undefined);
    throw err;
  }

  let confirmationSent = false;
  try {
    const msg = orderReceived({
      contractNumber: order.contract_number, orderedAt: order.ordered_at, withdrawalUntil: order.withdrawal_until,
      summary: summary as any, manageUrl: manageUrl(),
    });
    const sent = await sendMail({ to: m.email, ...msg }, member.id);
    await sql`select billing.mark_confirmation_sent(${order.contract_action_id}::uuid, ${sent.id})`;
    confirmationSent = true;
  } catch (err) {
    console.error(JSON.stringify({ level: "error", msg: "Bestellbestätigung nicht verschickt", error: String(err) }));
    await sql`select ops.audit('billing.confirmation_mail_failed', 'billing.contract_actions', ${String(order.contract_action_id)}, '{}'::jsonb)`;
  }

  return json(req, {
    subscriptionId: subscription.id,
    clientSecret,
    contractNumber: order.contract_number,
    orderedAt: order.ordered_at,
    withdrawalUntil: order.withdrawal_until,
    confirmationSent,
    publishableKey: optionalEnv("STRIPE_PUBLISHABLE_KEY") ?? null,
  });
});
