// Datenbank-Test: SUPABASE_DB_URL auf die Test-Datenbank (scripts/db.sh) setzen.
import { strict as assert } from "node:assert";
import { signStripePayload } from "../_shared/stripe/webhook.ts";
import { createMember, deleteUsers, hasDb, setupEnv, testSql, useMemoryMailer, WEBHOOK_SECRET } from "../_shared/stripe/testing.ts";
import handler from "./handler.ts";

setupEnv();
const opts = { ignore: !hasDb, sanitizeOps: false, sanitizeResources: false };

async function post(event: unknown, secret = WEBHOOK_SECRET, timestamp?: number): Promise<Response> {
  const payload = JSON.stringify(event);
  return await handler(new Request("https://fn.fermata.test/functions/v1/stripe-webhook", {
    method: "POST",
    headers: { "stripe-signature": await signStripePayload(payload, secret, timestamp), "content-type": "application/json" },
    body: payload,
  }));
}

function invoicePaid(evt: string, inv: string, sub: string, cus: string, amount = 14900) {
  const start = Math.floor(Date.now() / 1000);
  return {
    id: evt,
    type: "invoice.paid",
    data: {
      object: {
        id: inv, object: "invoice", customer: cus, amount_paid: amount, payment_intent: `pi_${inv}`,
        hosted_invoice_url: "https://invoice.stripe.com/i/test",
        parent: { type: "subscription_details", subscription_details: { subscription: sub, metadata: {} } },
        lines: { data: [{ period: { start, end: start + 28 * 86400 } }] },
      },
    },
  };
}

Deno.test({ name: "stripe-webhook: Signatur wird geprüft (falsch, veraltet, fehlend)", ...opts, fn: async () => {
  const sql = testSql();
  try {
    const bad = await post({ id: "evt_x", type: "invoice.paid" }, "whsec_falsch");
    assert.equal(bad.status, 400);
    assert.equal((await bad.json()).reason, "no_matching_signature");
    const old = await post({ id: "evt_x", type: "invoice.paid" }, WEBHOOK_SECRET, Math.floor(Date.now() / 1000) - 600);
    assert.equal((await old.json()).reason, "timestamp_out_of_tolerance");
    const none = await handler(new Request("https://fn.fermata.test/functions/v1/stripe-webhook", { method: "POST", body: "{}" }));
    assert.equal(none.status, 400);
    const [row] = await sql`select count(*)::int as n from billing.stripe_events where id = 'evt_x'`;
    assert.equal(row!.n, 0, "Ungeprüfte Ereignisse werden nicht gespeichert");
  } finally {
    await sql.end();
  }
} });

Deno.test({ name: "stripe-webhook: invoice.paid legt Zeitraum an, Wiederholung ist idempotent, Mail einmal", ...opts, fn: async () => {
  const sql = testSql();
  const mailer = useMemoryMailer();
  const m = await createMember(sql, { freePhaseEnded: true, freeGrant: 0 });
  const tag = m.id.slice(0, 8);
  const sub = `sub_wh_${tag}`, cus = `cus_wh_${tag}`;
  try {
    await sql`update billing.memberships set status = 'pending', tier = 'andante', stripe_customer_id = ${cus},
              stripe_subscription_id = ${sub}, contract_number = ${"FM-WH-" + tag}, ordered_at = now() where user_id = ${m.id}::uuid`;
    const event = invoicePaid(`evt_a_${tag}`, `in_a_${tag}`, sub, cus);
    const r1 = await post(event);
    assert.equal(r1.status, 200);
    assert.deepEqual(await r1.json(), { received: true, type: "invoice.paid", handled: true, mails: 1 });
    const r2 = await post(event);
    assert.deepEqual(await r2.json(), { received: true, duplicate: true }, "gleiches Ereignis zweimal");
    // Stripe schickt dieselbe Rechnung mit neuer Ereignis-ID (z. B. nach Neuversand): keine zweite Zuteilung
    const r3 = await post({ ...event, id: `evt_b_${tag}` });
    assert.equal((await r3.json()).handled, true);
    const [p] = await sql`select count(*)::int as n from billing.membership_periods where user_id = ${m.id}::uuid`;
    assert.equal(p!.n, 1);
    const [a] = await sql`select billing.available_evenings(${m.id}::uuid) as n, (select status from billing.memberships where user_id = ${m.id}::uuid) as s`;
    assert.equal(a!.n, 2);
    assert.equal(a!.s, "active");
    assert.equal(mailer.sent.length, 1);
    assert.equal(mailer.sent[0]!.template, "billing.activated");
    assert.equal(mailer.sent[0]!.to, m.email);
    const [e] = await sql`select processed_at is not null as done from billing.stripe_events where id = ${`evt_a_${tag}`}`;
    assert.equal(e!.done, true);
  } finally {
    await sql`delete from billing.stripe_events where id like ${`evt_%_${tag}`}`;
    await deleteUsers(sql, [m.id]);
    await sql.end();
  }
} });

Deno.test({ name: "stripe-webhook: Zahlung fehlgeschlagen → past_due und Mail; Abo gelöscht → beendet", ...opts, fn: async () => {
  const sql = testSql();
  const mailer = useMemoryMailer();
  const m = await createMember(sql, { freePhaseEnded: true, freeGrant: 0 });
  const tag = m.id.slice(0, 8);
  const sub = `sub_wf_${tag}`, cus = `cus_wf_${tag}`;
  try {
    await sql`update billing.memberships set status = 'pending', tier = 'auftakt', stripe_customer_id = ${cus},
              stripe_subscription_id = ${sub}, contract_number = ${"FM-WF-" + tag}, ordered_at = now() where user_id = ${m.id}::uuid`;
    await post(invoicePaid(`evt_p_${tag}`, `in_p_${tag}`, sub, cus, 4900));
    const failed = {
      id: `evt_f_${tag}`, type: "invoice.payment_failed",
      data: { object: { id: `in_f_${tag}`, customer: cus, subscription: sub, hosted_invoice_url: "https://invoice.stripe.com/i/f" } },
    };
    assert.equal((await (await post(failed)).json()).mails, 1);
    assert.equal((await (await post({ ...failed, id: `evt_f2_${tag}` })).json()).mails, 0, "zweiter Fehlschlag derselben Rechnung");
    const [s1] = await sql`select status from billing.memberships where user_id = ${m.id}::uuid`;
    assert.equal(s1!.status, "past_due");
    const mail = mailer.sent.find((x) => x.template === "billing.payment_failed")!;
    assert.ok(mail.text.includes("https://invoice.stripe.com/i/f"));

    const updated = {
      id: `evt_u_${tag}`, type: "customer.subscription.updated",
      data: { object: { id: sub, customer: cus, status: "active", cancel_at_period_end: true, items: { data: [{ current_period_end: Math.floor(Date.now() / 1000) + 86400 }] } } },
    };
    await post(updated);
    const [s2] = await sql`select status, cancel_at is not null as has_end from billing.memberships where user_id = ${m.id}::uuid`;
    assert.equal(s2!.status, "cancelled");
    assert.equal(s2!.has_end, true);

    await post({ id: `evt_d_${tag}`, type: "customer.subscription.deleted", data: { object: { id: sub, customer: cus, status: "canceled" } } });
    const [s3] = await sql`select status, billing.available_evenings(${m.id}::uuid) as n from billing.memberships where user_id = ${m.id}::uuid`;
    assert.equal(s3!.status, "ended");
    assert.equal(s3!.n, 0);

    const other = await post({ id: `evt_o_${tag}`, type: "checkout.session.completed", data: { object: { id: "cs_1" } } });
    assert.equal((await other.json()).handled, false, "nicht ausgewertete Ereignisse werden nur gespeichert");
  } finally {
    await sql`delete from billing.stripe_events where id like ${`evt_%_${tag}`}`;
    await deleteUsers(sql, [m.id]);
    await sql.end();
  }
} });

Deno.test({ name: "stripe-webhook: gespeichertes Ereignis enthält keine Karten- und Adressdaten", ...opts, fn: async () => {
  const sql = testSql();
  const tag = crypto.randomUUID().slice(0, 8);
  try {
    const event = {
      id: `evt_c_${tag}`, type: "charge.succeeded",
      data: { object: { id: `ch_${tag}`, amount: 4900, billing_details: { name: "Mara L", address: { line1: "Weg 1" } },
        payment_method_details: { card: { last4: "4242", brand: "visa" } }, customer_address: { city: "Schwerin" },
        receipt_email: "mara@example.test", receipt_url: "https://pay.stripe.com/receipts/x",
        customer_details: { email: "mara@example.test" }, metadata: { fermata_user_id: "u-1" } } },
    };
    assert.equal((await post(event)).status, 200);
    const [row] = await sql`select payload::text as p from billing.stripe_events where id = ${event.id}`;
    assert.ok(row!.p.includes(`ch_${tag}`) && row!.p.includes("4900") && row!.p.includes("u-1"));
    for (const s of ["4242", "visa", "Mara L", "Weg 1", "Schwerin", "mara@example.test", "pay.stripe.com"]) {
      assert.ok(!row!.p.includes(s), `gespeichert: ${s}`);
    }
  } finally {
    await sql`delete from billing.stripe_events where id = ${`evt_c_${tag}`}`;
    await sql.end();
  }
} });
