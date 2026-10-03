// Stripe-Webhook. Endpunkt in Stripe: https://<projekt>.supabase.co/functions/v1/stripe-webhook
// (ohne JWT-Prüfung von Supabase: in supabase/config.toml bzw. beim Deploy --no-verify-jwt).
// 1. Signatur prüfen (HMAC-SHA256 über "t.payload", Toleranz 5 Minuten, Vergleich in konstanter Zeit).
// 2. Ereignis idempotent speichern (billing.stripe_events, Schlüssel = Ereignis-ID).
// 3. In einer Transaktion verarbeiten (Regeln in SQL), als verarbeitet markieren.
// 4. Danach Mails (Mitgliedschaft aktiv, Zahlung fehlgeschlagen). Kartendaten kommen hier nie an.
import { db } from "../_shared/db.ts";
import { env } from "../_shared/env.ts";
import { handler, json } from "../_shared/http.ts";
import { sendMail } from "../_shared/mail/mod.ts";
import { membershipActivated, paymentFailed } from "../_shared/mail/templates/billing.ts";
import { manageUrl, userContact } from "../_shared/stripe/contract.ts";
import { type EventOutcome, processStripeEvent } from "../_shared/stripe/events.ts";
import { verifyStripeSignature } from "../_shared/stripe/webhook.ts";

type Obj = Record<string, any>;

async function notify(outcome: EventOutcome): Promise<number> {
  const sql = db();
  let sent = 0;
  for (const n of outcome.notify ?? []) {
    try {
      const contact = await userContact(sql, n.userId);
      if (!contact.email) continue;
      if (n.kind === "activated") {
        const [t] = await sql`select ops.setting('billing.tiers') -> ${n.tier ?? "auftakt"} ->> 'name' as name`;
        await sendMail({
          to: contact.email,
          ...membershipActivated({ tierName: t?.name ?? "", evenings: n.evenings, periodEnd: n.periodEnd, manageUrl: manageUrl() }),
        }, n.userId);
      } else {
        const [t] = await sql`select ops.setting('billing.tiers') -> m.tier ->> 'name' as name from billing.memberships m where m.user_id = ${n.userId}::uuid`;
        await sendMail({ to: contact.email, ...paymentFailed({ tierName: t?.name, invoiceUrl: n.invoiceUrl, manageUrl: manageUrl() }) }, n.userId);
      }
      sent++;
    } catch (err) {
      console.error(JSON.stringify({ level: "warn", msg: "Mail nach Stripe-Ereignis fehlgeschlagen", kind: n.kind, error: String(err) }));
    }
  }
  return sent;
}

export default handler(["POST"], async (req) => {
  const payload = await req.text();
  if (payload.length > 512_000) return json(req, { error: "payload_too_large" }, 413);
  const check = await verifyStripeSignature(payload, req.headers.get("stripe-signature"), env("STRIPE_WEBHOOK_SECRET"));
  if (!check.ok) return json(req, { error: "invalid_signature", reason: check.reason }, 400);

  let event: Obj;
  try {
    event = JSON.parse(payload);
  } catch {
    return json(req, { error: "invalid_json" }, 400);
  }
  if (typeof event?.id !== "string" || typeof event?.type !== "string") return json(req, { error: "invalid_event" }, 400);

  const sql = db();
  const [accepted] = await sql`select billing.accept_stripe_event(${event.id}, ${event.type}, ${sql.json(event as any)}::jsonb) as fresh`;
  if (!accepted?.fresh) return json(req, { received: true, duplicate: true });

  let outcome: EventOutcome | undefined;
  try {
    outcome = await sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtextextended(${"stripe:" + event.id}, 0))`;
      const [again] = await tx`select processed_at from billing.stripe_events where id = ${event.id}`;
      if (again?.processed_at) return undefined;
      const result = await processStripeEvent(tx as any, event);
      await tx`select billing.finish_stripe_event(${event.id}, null)`;
      return result;
    }) as EventOutcome | undefined;
  } catch (err) {
    await sql`select billing.finish_stripe_event(${event.id}, ${String((err as Error)?.message ?? err).slice(0, 500)})`;
    throw err; // 500 → Stripe wiederholt die Zustellung
  }
  if (!outcome) return json(req, { received: true, duplicate: true });
  const mails = await notify(outcome);
  return json(req, { received: true, type: outcome.type, handled: outcome.handled, mails });
});
