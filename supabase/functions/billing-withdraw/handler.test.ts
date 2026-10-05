// Datenbank-Test (SUPABASE_DB_URL). Stripe über Ersatz, um Kündigung und Erstattung genau zu prüfen.
import { strict as assert } from "node:assert";
import { setStripe } from "../_shared/stripe/client.ts";
import {
  activateMember,
  cleanupEvenings,
  createEvening,
  createMember,
  deleteUsers,
  fakeStripe,
  hasDb,
  request,
  setupEnv,
  signJwt,
  testSql,
  useMemoryMailer,
} from "../_shared/stripe/testing.ts";
import handler from "./handler.ts";

setupEnv();
const opts = { ignore: !hasDb, sanitizeOps: false, sanitizeResources: false };

Deno.test({ name: "billing-withdraw: Wertersatz, sofortiges Ende, Erstattung, Eingangsbestätigung, Gegenüber neutral informiert", ...opts, fn: async () => {
  const sql = testSql();
  const mailer = useMemoryMailer();
  const fake = fakeStripe();
  const m = await createMember(sql, { firstName: "Jonas", lastName: "Weber", freePhaseEnded: true, freeGrant: 0 });
  const past = await createMember(sql);
  const next = await createMember(sql);
  try {
    const c = await activateMember(sql, m.id, { tier: "andante", amountCents: 14900 });
    await createEvening(sql, m.id, past.id, { state: "happened", startsInHours: -3 });
    const upcoming = await createEvening(sql, m.id, next.id, { state: "confirmed", startsInHours: 72, venueName: "Weinstube am See" });
    const token = await signJwt(m.id);

    // Schritt 1: Angaben vorausgefüllt, Berechnung sichtbar
    const pv = await (await handler(request("billing-withdraw", { json: { action: "preview" }, token }))).json();
    assert.equal(pv.possible, true);
    assert.equal(pv.contractNumber, c.contractNumber);
    assert.equal(pv.name, "Jonas Weber");
    assert.equal(pv.eveningsUsed, 1);
    assert.equal(pv.wertersatzCents, 7450);
    assert.equal(pv.refundCents, 7450);
    assert.equal(pv.buttonLabel, "Widerruf bestätigen");

    const wrong = await handler(request("billing-withdraw", { json: { action: "confirm", name: "Jonas Weber", contractNumber: "FM-AAAA-BBBB" }, token }));
    assert.equal(wrong.status, 400);
    assert.equal((await wrong.json()).error, "contract_mismatch");
    const noName = await handler(request("billing-withdraw", { json: { action: "confirm", contractNumber: c.contractNumber }, token }));
    assert.equal(noName.status, 400);

    // Schritt 2: „Widerruf bestätigen“
    const res = await handler(request("billing-withdraw", {
      json: { action: "confirm", name: "Jonas Weber", contractNumber: c.contractNumber, contactEmail: "jonas@example.test" },
      token,
    }));
    const r = await res.json();
    assert.equal(res.status, 200, JSON.stringify(r));
    assert.equal(r.refund, "ok");
    assert.equal(r.refundCents, 7450);
    assert.equal(r.cancelledEvenings, 1);
    assert.equal(r.confirmationSent, true);

    assert.ok(fake.calls.some((x) => x.method === "DELETE" && x.path === `/v1/subscriptions/${c.subscriptionId}`), "Abo sofort beendet");
    const refund = fake.calls.find((x) => x.method === "POST" && x.path === "/v1/refunds")!;
    assert.equal(refund.params.get("payment_intent"), `pi_t_${m.id.slice(0, 8)}`);
    assert.equal(refund.params.get("amount"), "7450");
    assert.ok(refund.headers["idempotency-key"]?.startsWith("fermata-refund-"));

    const receipt = mailer.sent.find((x) => x.template === "billing.withdraw_receipt")!;
    assert.equal(receipt.to, "jonas@example.test");
    assert.match(receipt.text, /Eingang Ihres Widerrufs am \d{2}\.\d{2}\.\d{4}, \d{2}:\d{2}:\d{2} Uhr/);
    assert.ok(receipt.text.includes("74,50 €"));

    const neutral = mailer.sent.find((x) => x.template === "safety.evening_cancelled")!;
    assert.equal(neutral.to, next.email, "Gegenüber des abgesagten Abends wird benachrichtigt");
    assert.ok(neutral.text.includes("Weinstube am See") && !/widerruf/i.test(neutral.text));

    const [row] = await sql`
      select m.status, billing.available_evenings(m.user_id) as avail,
             (select state from app.evenings where id = ${upcoming}::uuid) as evening_state,
             (select result -> 'refund' ->> 'refund_id' from billing.contract_actions where user_id = m.user_id and kind = 'withdraw') as refund_id
      from billing.memberships m where m.user_id = ${m.id}::uuid`;
    assert.equal(row!.status, "withdrawn");
    assert.equal(row!.avail, 0);
    assert.equal(row!.evening_state, "cancelled_early");
    assert.ok(String(row!.refund_id).startsWith("re_fake_"));

    const again = await handler(request("billing-withdraw", { json: { action: "confirm", name: "Jonas Weber", contractNumber: c.contractNumber }, token }));
    assert.equal(again.status, 409);
  } finally {
    setStripe(undefined);
    await cleanupEvenings(sql, [m.id, past.id, next.id]);
    await sql.end();
  }
} });

Deno.test({ name: "billing-withdraw: Zahlung über die Rechnung suchen; ohne Erstattungsweg → Benn erstattet von Hand", ...opts, fn: async () => {
  const sql = testSql();
  const mailer = useMemoryMailer();
  const fake = fakeStripe();
  const a = await createMember(sql, { freePhaseEnded: true, freeGrant: 0 });
  try {
    const c = await activateMember(sql, a.id, { tier: "auftakt", amountCents: 4900, withPaymentIntent: false });
    const r = await (await handler(request("billing-withdraw", {
      json: { action: "confirm", name: "Test Person", contractNumber: c.contractNumber }, token: await signJwt(a.id),
    }))).json();
    assert.equal(r.refund, "ok");
    assert.equal(r.refundCents, 4900, "nichts genutzt: alles zurück");
    assert.ok(fake.calls.some((x) => x.method === "GET" && x.path === `/v1/invoices/${c.invoiceId}` && x.params.get("expand[0]") === "payments"));
    assert.equal(fake.calls.find((x) => x.path === "/v1/refunds")!.params.get("payment_intent"), "pi_from_invoice");
    assert.ok(mailer.sent.some((x) => x.template === "billing.withdraw_receipt"));
  } finally {
    setStripe(undefined);
    await deleteUsers(sql, [a.id]);
  }

  fakeStripe((method, path) => method === "POST" && path === "/v1/refunds" ? { status: 400, body: { error: { type: "invalid_request_error", message: "nein" } } } : undefined);
  const b = await createMember(sql, { freePhaseEnded: true, freeGrant: 0 });
  try {
    const c = await activateMember(sql, b.id, { tier: "auftakt", amountCents: 4900 });
    const r = await (await handler(request("billing-withdraw", {
      json: { action: "confirm", name: "Test Person", contractNumber: c.contractNumber }, token: await signJwt(b.id),
    }))).json();
    assert.equal(r.refund, "manual");
    const receipt = mailer.sent.filter((x) => x.template === "billing.withdraw_receipt").pop()!;
    assert.ok(receipt.text.includes("von Hand"));
    const [q] = await sql`select count(*)::int as n from safety.mail_queue where to_admin and data ->> 'kind' = 'widerruf_von_hand' and data ->> 'contract_number' = ${c.contractNumber}`;
    assert.equal(q!.n, 1);
    await sql`delete from safety.mail_queue where to_admin and data ->> 'contract_number' = ${c.contractNumber}`;
  } finally {
    setStripe(undefined);
    await deleteUsers(sql, [b.id]);
    await sql.end();
  }
} });

Deno.test({ name: "billing-withdraw: ohne Anmeldung über Formular und Link", ...opts, fn: async () => {
  const sql = testSql();
  const mailer = useMemoryMailer();
  fakeStripe();
  const m = await createMember(sql, { freePhaseEnded: true, freeGrant: 0 });
  try {
    const c = await activateMember(sql, m.id, { tier: "auftakt", amountCents: 4900 });
    const res = await handler(request("billing-withdraw", {
      json: { action: "request", email: m.email, contractNumber: c.contractNumber, name: "Test Person" },
    }));
    assert.equal(res.status, 202);
    const appLink = /https:\/\/app\.fermata\.test\/widerrufen\/bestaetigen#t=[0-9a-f]{64}/.exec(mailer.sent[0]!.text)![0];
    const token = new URL(appLink).hash.slice(3);
    const link = `https://fn.fermata.test/functions/v1/billing-withdraw?t=${token}`;
    const peek = await handler(new Request(link, { headers: { accept: "application/json" } }));
    const info = await peek.json();
    assert.equal(peek.status, 200, JSON.stringify(info));
    assert.equal(info.kind, "withdraw");
    assert.equal(info.contract_number, c.contractNumber);
    const page = await handler(new Request(link));
    assert.ok((await page.text()).includes("Widerruf bestätigen"));
    const done = await handler(new Request(link, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "confirm_link", t: token }),
    }));
    const r = await done.json();
    assert.equal(done.status, 200, JSON.stringify(r));
    assert.equal(r.refundCents, 4900);
    const [row] = await sql`select details ->> 'channel' as channel from billing.contract_actions where user_id = ${m.id}::uuid and kind = 'withdraw'`;
    assert.equal(row!.channel, "ohne_anmeldung");
  } finally {
    setStripe(undefined);
    await deleteUsers(sql, [m.id]);
    await sql.end();
  }
} });
