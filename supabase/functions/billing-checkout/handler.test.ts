// Datenbank-Test; Stripe über stripe-mock (STRIPE_MOCK_URL, Standard http://localhost:54383), sonst über einen Ersatz.
import { strict as assert } from "node:assert";
import { setStripe, StripeClient } from "../_shared/stripe/client.ts";
import {
  createMember,
  deleteUsers,
  fakeStripe,
  hasDb,
  request,
  setupEnv,
  signJwt,
  STRIPE_MOCK_URL,
  stripeMockAvailable,
  testSql,
  useMemoryMailer,
} from "../_shared/stripe/testing.ts";
import handler from "./handler.ts";

setupEnv();
const opts = { ignore: !hasDb, sanitizeOps: false, sanitizeResources: false };

Deno.test({ name: "billing-checkout: ohne Anmeldung 401, unbekannte Stufe 400, Loge (Testphase aus) 409", ...opts, fn: async () => {
  const sql = testSql();
  const m = await createMember(sql);
  try {
    const anon = await handler(request("billing-checkout", { json: { action: "summary", tier: "andante" } }));
    assert.equal(anon.status, 401);
    const token = await signJwt(m.id);
    const bad = await handler(request("billing-checkout", { json: { action: "summary", tier: "platin" }, token }));
    assert.equal(bad.status, 400);
    assert.equal((await bad.json()).error, "invalid_tier");
    const loge = await handler(request("billing-checkout", { json: { action: "summary", tier: "loge" }, token }));
    assert.equal(loge.status, 409);
    assert.equal((await loge.json()).error, "tier_not_orderable");
  } finally {
    await deleteUsers(sql, [m.id]);
    await sql.end();
  }
} });

Deno.test({ name: "billing-checkout: Übersicht und Bestellung (stripe-mock), Bestätigungs-Mail, gespeicherte Erklärung", ...opts, fn: async () => {
  const sql = testSql();
  const mailer = useMemoryMailer();
  const useMock = await stripeMockAvailable();
  const fake = useMock ? undefined : fakeStripe();
  if (useMock) setStripe(new StripeClient({ secretKey: "sk_test_123", apiBase: STRIPE_MOCK_URL, maxRetries: 0 }));
  console.log(useMock ? "  (gegen stripe-mock)" : "  (stripe-mock nicht erreichbar: Ersatz)");
  const m = await createMember(sql, { firstName: "Mara", freePhaseEnded: true });
  try {
    const token = await signJwt(m.id);
    const sRes = await handler(request("billing-checkout", { json: { action: "summary", tier: "andante" }, token }));
    assert.equal(sRes.status, 200);
    const s = await sRes.json();
    assert.equal(s.buttonLabel, "Mitgliedschaft zahlungspflichtig abschließen");
    assert.equal(s.summary.price_display, "149,00 €");
    assert.equal(s.summary.evenings_per_period, 2);
    assert.match(s.summaryHash, /^[0-9a-f]{64}$/);

    const stale = await handler(request("billing-checkout", { json: { action: "order", tier: "andante", summaryHash: "0".repeat(64) }, token }));
    assert.equal(stale.status, 409);
    assert.equal((await stale.json()).error, "summary_changed");

    const oRes = await handler(request("billing-checkout", {
      json: { action: "order", tier: "andante", summaryHash: s.summaryHash, requestId: crypto.randomUUID() },
      token,
    }));
    const o = await oRes.json();
    assert.equal(oRes.status, 200, JSON.stringify(o));
    assert.ok(typeof o.subscriptionId === "string" && o.subscriptionId.startsWith("sub_"));
    assert.ok("clientSecret" in o);
    assert.match(o.contractNumber, /^FM-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    assert.equal(o.confirmationSent, true);

    const [row] = await sql`
      select m.status, m.tier, m.stripe_subscription_id, m.stripe_customer_id,
             c.details ->> 'button_label' as label, c.details -> 'summary' ->> 'price_display' as price, c.confirmation_sent_at
      from billing.memberships m join billing.contract_actions c on c.user_id = m.user_id and c.kind = 'order'
      where m.user_id = ${m.id}::uuid`;
    assert.equal(row!.status, "pending");
    assert.equal(row!.tier, "andante");
    assert.equal(row!.stripe_subscription_id, o.subscriptionId);
    assert.equal(row!.label, "Mitgliedschaft zahlungspflichtig abschließen");
    assert.equal(row!.price, "149,00 €");
    assert.ok(row!.confirmation_sent_at);

    assert.equal(mailer.sent.length, 1);
    const mail = mailer.sent[0]!;
    assert.equal(mail.template, "billing.order_received");
    assert.equal(mail.to, m.email);
    assert.ok(mail.text.includes(o.contractNumber) && mail.text.includes("Mitgliedschaft zahlungspflichtig abschließen"));

    if (fake) {
      const subCall = fake.calls.find((c) => c.method === "POST" && c.path === "/v1/subscriptions")!;
      assert.equal(subCall.params.get("payment_behavior"), "default_incomplete");
      assert.equal(subCall.params.get("expand[0]"), "latest_invoice.confirmation_secret");
      assert.equal(subCall.params.get("metadata[fermata_user_id]"), m.id);
      assert.equal(o.clientSecret, "pi_fake_secret_abc");
    }

    // Laufende Mitgliedschaft: keine zweite Bestellung
    await sql`update billing.memberships set status = 'active' where user_id = ${m.id}::uuid`;
    const again = await handler(request("billing-checkout", { json: { action: "order", tier: "auftakt", summaryHash: "x" }, token }));
    assert.equal(again.status, 409);
  } finally {
    setStripe(undefined);
    await deleteUsers(sql, [m.id]);
    await sql.end();
  }
} });

Deno.test({ name: "billing-checkout: Stripe-Fehler → 502, nichts gespeichert", ...opts, fn: async () => {
  const sql = testSql();
  useMemoryMailer();
  fakeStripe((method, path) => method === "POST" && path === "/v1/subscriptions" ? { status: 500, body: { error: { type: "api_error", message: "kaputt" } } } : undefined);
  const m = await createMember(sql, { freePhaseEnded: true });
  try {
    const token = await signJwt(m.id);
    const s = await (await handler(request("billing-checkout", { json: { action: "summary", tier: "auftakt" }, token }))).json();
    const res = await handler(request("billing-checkout", { json: { action: "order", tier: "auftakt", summaryHash: s.summaryHash }, token }));
    assert.equal(res.status, 502);
    const [row] = await sql`select count(*)::int as n from billing.contract_actions where user_id = ${m.id}::uuid`;
    assert.equal(row!.n, 0);
  } finally {
    setStripe(undefined);
    await deleteUsers(sql, [m.id]);
    await sql.end();
  }
} });

Deno.test({ name: "billing-checkout: Abo-Parameter an Stripe (default_incomplete, 4-Wochen-Preis, Idempotenz)", ...opts, fn: async () => {
  const sql = testSql();
  useMemoryMailer();
  const fake = fakeStripe((method, path) => method === "GET" && path === "/v1/prices" ? { body: { data: [] } } : undefined);
  const m = await createMember(sql, { freePhaseEnded: true });
  try {
    const token = await signJwt(m.id);
    const s = await (await handler(request("billing-checkout", { json: { action: "summary", tier: "auftakt" }, token }))).json();
    const requestId = crypto.randomUUID();
    const res = await handler(request("billing-checkout", { json: { action: "order", tier: "auftakt", summaryHash: s.summaryHash, requestId }, token }));
    assert.equal(res.status, 200);
    assert.equal((await res.json()).clientSecret, "pi_fake_secret_abc");
    const price = fake.calls.find((c) => c.method === "POST" && c.path === "/v1/prices")!;
    assert.equal(price.params.get("recurring[interval]"), "week");
    assert.equal(price.params.get("recurring[interval_count]"), "4");
    assert.equal(price.params.get("unit_amount"), "4900");
    assert.equal(price.params.get("currency"), "eur");
    assert.equal(price.params.get("lookup_key"), "fermata_auftakt_4900_4w");
    assert.equal(price.params.get("tax_behavior"), "inclusive");
    const sub = fake.calls.find((c) => c.method === "POST" && c.path === "/v1/subscriptions")!;
    assert.equal(sub.params.get("payment_behavior"), "default_incomplete");
    assert.equal(sub.params.get("payment_settings[save_default_payment_method]"), "on_subscription");
    assert.equal(sub.params.get("expand[0]"), "latest_invoice.confirmation_secret");
    assert.equal(sub.params.get("metadata[fermata_user_id]"), m.id);
    assert.equal(sub.headers["idempotency-key"], `fermata-subscription-${m.id}-${requestId}`);
    const customer = fake.calls.find((c) => c.path === "/v1/customers")!;
    assert.equal(customer.params.get("email"), m.email);
    assert.equal([...customer.params.keys()].filter((k) => /card|address|phone|name/.test(k)).length, 0, "nur E-Mail und interne ID an Stripe");
  } finally {
    setStripe(undefined);
    await deleteUsers(sql, [m.id]);
    await sql.end();
  }
} });
