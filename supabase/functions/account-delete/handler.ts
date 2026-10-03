// POST /functions/v1/account-delete – Konto löschen (Art. 17 DSGVO). Body: { "confirm": true }
// 1. ops.account_deletion_prepare: Audit, offene Abende absagen (Gegenüber und Lokal bekommen die neutrale Nachricht
//    aus M5), Kündigung eines laufenden Stripe-Abos festhalten („konto_geloescht“), Einladungen und Protokolle
//    entfernen, Sicherheits-Hinweis bei laufender Prüfung.
// 2. Stripe-Abo sofort beenden (DELETE /v1/subscriptions/{id}). Ein Fehler hält die Löschung nicht auf: er steht im
//    Audit und als Hinweis für Benn (ops.account_deletion_stripe_result), der das Abo dann im Dashboard beendet.
// 3. Supabase Auth löscht die Person; alle Tabellen mit on delete cascade folgen,
//    gesetzlich Nötiges bleibt ohne Personenbezug (z. B. billing.contract_actions.user_id = null).
// 4. Nachweis im Audit, Bestätigung per Mail.
import { z } from "zod";
import { requireUser } from "../_shared/auth.ts";
import { db } from "../_shared/db.ts";
import { rethrowDbError } from "../_shared/dberror.ts";
import { optionalEnv } from "../_shared/env.ts";
import { adminDeleteUser } from "../_shared/gotrue.ts";
import { handler, HttpError, json, readJson } from "../_shared/http.ts";
import { sendMail } from "../_shared/mail/mod.ts";
import { accountDeletedMail } from "../_shared/mail/templates/account.ts";
import { stripe, StripeError } from "../_shared/stripe/client.ts";

const Body = z.object({ confirm: z.literal(true) });

interface PrepareResult {
  email: string;
  first_name: string | null;
  address_form: "sie" | "du";
  evenings?: { cancelled: number; failed: number };
  stripe?: { contract_action_id: string; subscription_id: string } | null;
}

/** Beendet das Abo sofort. Liefert true bei Erfolg (auch wenn Stripe es schon nicht mehr kennt). */
async function cancelSubscription(subscriptionId: string): Promise<{ ok: boolean; detail: Record<string, unknown> }> {
  try {
    const sub = await stripe().request<{ id?: string; status?: string }>(
      "DELETE",
      `/v1/subscriptions/${encodeURIComponent(subscriptionId)}`,
    );
    return { ok: true, detail: { stripe_status: sub.status ?? null } };
  } catch (err) {
    if (err instanceof StripeError && err.status === 404) {
      return { ok: true, detail: { stripe_status: "missing" } };
    }
    const e = err as StripeError;
    console.error(JSON.stringify({ level: "error", msg: "stripe_cancel_on_deletion_failed", status: e?.status, type: e?.type }));
    return { ok: false, detail: { error: err instanceof StripeError ? `${err.status} ${err.type}` : String(err).slice(0, 200) } };
  }
}

export default handler(["POST"], async (req) => {
  const user = await requireUser(req);
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) throw new HttpError(422, "confirmation_required");

  const sql = db();
  let info: PrepareResult;
  try {
    const [row] = await sql`select ops.account_deletion_prepare(${user.id}::uuid) as r`;
    info = row!.r as PrepareResult;
  } catch (err) {
    rethrowDbError(err);
  }

  let subscriptionCancelled: boolean | null = null;
  if (info.stripe?.subscription_id) {
    const result = await cancelSubscription(info.stripe.subscription_id);
    subscriptionCancelled = result.ok;
    try {
      await sql`select ops.account_deletion_stripe_result(${info.stripe.contract_action_id}::uuid, ${result.ok},
                ${sql.json(result.detail as any)}::jsonb)`;
    } catch (err) {
      // Auch das darf die Löschung nicht aufhalten; der Fehler steht im Protokoll der Function.
      console.error(JSON.stringify({ level: "error", msg: "stripe_result_not_saved", err: String(err) }));
    }
  }

  await adminDeleteUser(user.id);
  const [done] = await sql`select ops.account_deletion_done(${user.id}::uuid) as ok`;

  let mailSent = true;
  try {
    await sendMail(accountDeletedMail({
      to: info.email,
      firstName: info.first_name,
      addressForm: info.address_form,
      contactEmail: optionalEnv("FERMATA_CONTACT_EMAIL"),
    }));
  } catch (err) {
    mailSent = false;
    console.error(JSON.stringify({ level: "error", msg: "deletion_mail_failed", err: String(err) }));
  }
  return json(req, {
    deleted: Boolean(done!.ok),
    mail_sent: mailSent,
    evenings_cancelled: info.evenings?.cancelled ?? 0,
    subscription_cancelled: subscriptionCancelled,
  });
});
