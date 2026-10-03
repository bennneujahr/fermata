// Verlängerungsregel, Stripe-Seite (interne Function, Aufruf durch pg_net nach billing.apply_extension_rule()
// oder per Zeitplan; immer mit FERMATA_INTERNAL_SECRET).
// Mechanismus: Das Abrechnungsdatum wird über trial_end auf das neue Ende verschoben (proration_behavior=none).
// Stripe beendet damit den laufenden Zeitraum und startet eine kostenlose Phase bis trial_end; danach wird
// normal abgebucht. Quelle: https://docs.stripe.com/billing/subscriptions/billing-cycle (Abschnitt „trial_end“).
// Die dabei entstehende Rechnung über 0 € legt in billing.apply_invoice_paid keinen Zeitraum an.
import { db } from "../_shared/db.ts";
import { handler, json, readJson } from "../_shared/http.ts";
import { sendMail } from "../_shared/mail/mod.ts";
import { periodExtended } from "../_shared/mail/templates/billing.ts";
import { stripe, unix } from "../_shared/stripe/client.ts";
import { manageUrl, userContact } from "../_shared/stripe/contract.ts";
import { requireInternal } from "../_shared/stripe/support.ts";

type Obj = Record<string, any>;

export default handler(["POST"], async (req) => {
  requireInternal(req);
  const body = await readJson<Obj>(req).catch(() => ({} as Obj));
  const sql = db();
  let extended = 0;
  if (body.runRule !== false) {
    const [r] = await sql`select billing.apply_extension_rule() as n`;
    extended = Number(r?.n ?? 0);
  }
  const work = await sql`
    select w.*, (ops.setting('billing.tiers') -> m.tier ->> 'name') as tier_name
    from billing.extension_work() w join billing.memberships m on m.user_id = w.user_id`;
  const results: Obj[] = [];
  for (const w of work) {
    let synced = false;
    let error: string | null = null;
    let notified = false;
    if (w.sync_needed && w.subscription_id) {
      try {
        await stripe().request("POST", `/v1/subscriptions/${w.subscription_id}`, {
          trial_end: unix(w.extended_until),
          proration_behavior: "none",
          metadata: { fermata_extension_period: w.period_id },
        }, { idempotencyKey: `fermata-extend-${w.period_id}-${unix(w.extended_until)}` });
        synced = true;
      } catch (err) {
        error = String((err as Error)?.message ?? err).slice(0, 300);
      }
    }
    if (w.notify_needed && (synced || !w.sync_needed)) {
      try {
        const contact = await userContact(sql, w.user_id);
        if (contact.email) {
          await sendMail({ to: contact.email, ...periodExtended({ extendedUntil: w.extended_until, tierName: w.tier_name, manageUrl: manageUrl() }) }, w.user_id);
          notified = true;
        }
      } catch (err) {
        console.error(JSON.stringify({ level: "warn", msg: "Hinweis zur Verlängerung nicht verschickt", error: String(err) }));
      }
    }
    await sql`select billing.mark_extension(${w.period_id}::uuid, ${synced}, ${error}, ${notified})`;
    results.push({ periodId: w.period_id, synced, notified, error });
  }
  return json(req, { extended, processed: results.length, results });
});
