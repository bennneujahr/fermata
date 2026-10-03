import { strict as assert } from "node:assert";
import { parseSignatureHeader, signStripePayload, verifyStripeSignature } from "./webhook.ts";
import { formEncode, StripeClient, StripeError } from "./client.ts";
import { signJwt } from "./testing.ts";
import { verifyJwt } from "./member-auth.ts";
import { hmacSha256Hex } from "../crypto.ts";

const SECRET = "whsec_test_secret";
const PAYLOAD = JSON.stringify({ id: "evt_1", type: "invoice.paid", data: { object: { id: "in_1" } } });
const NOW = 1_790_000_000;

Deno.test("Stripe-Signatur: gültig", async () => {
  const header = await signStripePayload(PAYLOAD, SECRET, NOW);
  assert.deepEqual(await verifyStripeSignature(PAYLOAD, header, SECRET, { nowSeconds: NOW + 10 }), { ok: true, timestamp: NOW });
});

Deno.test("Stripe-Signatur: veränderter Inhalt wird abgelehnt", async () => {
  const header = await signStripePayload(PAYLOAD, SECRET, NOW);
  const tampered = PAYLOAD.replace("in_1", "in_2");
  assert.deepEqual(await verifyStripeSignature(tampered, header, SECRET, { nowSeconds: NOW }), { ok: false, reason: "no_matching_signature" });
});

Deno.test("Stripe-Signatur: veränderte Signatur wird abgelehnt", async () => {
  const header = await signStripePayload(PAYLOAD, SECRET, NOW);
  const flipped = header.slice(0, -1) + (header.endsWith("0") ? "1" : "0");
  assert.equal((await verifyStripeSignature(PAYLOAD, flipped, SECRET, { nowSeconds: NOW })).ok, false);
});

Deno.test("Stripe-Signatur: falsches Geheimnis wird abgelehnt", async () => {
  const header = await signStripePayload(PAYLOAD, "whsec_other", NOW);
  assert.equal((await verifyStripeSignature(PAYLOAD, header, SECRET, { nowSeconds: NOW })).ok, false);
});

Deno.test("Stripe-Signatur: älter als 5 Minuten wird abgelehnt", async () => {
  const header = await signStripePayload(PAYLOAD, SECRET, NOW);
  assert.deepEqual(await verifyStripeSignature(PAYLOAD, header, SECRET, { nowSeconds: NOW + 301 }), {
    ok: false,
    reason: "timestamp_out_of_tolerance",
  });
  assert.equal((await verifyStripeSignature(PAYLOAD, header, SECRET, { nowSeconds: NOW + 300 })).ok, true);
});

Deno.test("Stripe-Signatur: Zeit in der Zukunft außerhalb der Toleranz wird abgelehnt", async () => {
  const header = await signStripePayload(PAYLOAD, SECRET, NOW + 600);
  assert.equal((await verifyStripeSignature(PAYLOAD, header, SECRET, { nowSeconds: NOW })).ok, false);
});

Deno.test("Stripe-Signatur: fehlender oder kaputter Header", async () => {
  assert.deepEqual(await verifyStripeSignature(PAYLOAD, null, SECRET), { ok: false, reason: "missing_header" });
  assert.deepEqual(await verifyStripeSignature(PAYLOAD, "t=abc,v1=xyz", SECRET), { ok: false, reason: "malformed_header" });
  assert.deepEqual(await verifyStripeSignature(PAYLOAD, `t=${NOW}`, SECRET), { ok: false, reason: "malformed_header" });
});

Deno.test("Stripe-Signatur: mehrere v1-Werte (Geheimnis wird gewechselt), einer passt", async () => {
  const good = await hmacSha256Hex(SECRET, `${NOW}.${PAYLOAD}`);
  const header = `t=${NOW},v1=${"0".repeat(64)},v0=abc,v1=${good}`;
  assert.equal((await verifyStripeSignature(PAYLOAD, header, SECRET, { nowSeconds: NOW })).ok, true);
  assert.equal(parseSignatureHeader(header).signatures.length, 2);
});

Deno.test("Stripe-Formular-Kodierung: verschachtelt wie bei Stripe", () => {
  const body = formEncode({
    customer: "cus_1",
    items: [{ price: "price_1" }],
    payment_settings: { save_default_payment_method: "on_subscription" },
    expand: ["latest_invoice.confirmation_secret"],
    metadata: { fermata_user_id: "u1" },
    cancel_at_period_end: true,
    skip: undefined,
  });
  assert.equal(
    body.toString(),
    "customer=cus_1&items%5B0%5D%5Bprice%5D=price_1&payment_settings%5Bsave_default_payment_method%5D=on_subscription" +
      "&expand%5B0%5D=latest_invoice.confirmation_secret&metadata%5Bfermata_user_id%5D=u1&cancel_at_period_end=true",
  );
});

Deno.test("Stripe-Client: Fehler werden als StripeError gemeldet, Idempotenz-Schlüssel wird gesendet", async () => {
  const seen: Headers[] = [];
  const client = new StripeClient({
    secretKey: "sk_test_x",
    apiBase: "https://stripe.fake",
    maxRetries: 0,
    fetchFn: (_input, init) => {
      seen.push(new Headers(init?.headers));
      return Promise.resolve(new Response(JSON.stringify({ error: { type: "card_error", code: "card_declined", message: "Karte abgelehnt" } }), { status: 402 }));
    },
  });
  await assert.rejects(() => client.request("POST", "/v1/subscriptions", { customer: "c" }, { idempotencyKey: "k1" }), (err: unknown) => {
    assert.ok(err instanceof StripeError);
    assert.equal(err.status, 402);
    assert.equal(err.code, "card_declined");
    return true;
  });
  assert.equal(seen[0]!.get("idempotency-key"), "k1");
  assert.equal(seen[0]!.get("authorization"), "Bearer sk_test_x");
});

Deno.test("Stripe-Client: wiederholt bei 500, wenn sicher", async () => {
  let count = 0;
  const client = new StripeClient({
    secretKey: "sk_test_x",
    apiBase: "https://stripe.fake",
    maxRetries: 2,
    fetchFn: () => {
      count++;
      return Promise.resolve(count < 2 ? new Response("{}", { status: 500 }) : new Response(JSON.stringify({ id: "ok" }), { status: 200 }));
    },
  });
  const res = await client.request<{ id: string }>("POST", "/v1/refunds", {}, { idempotencyKey: "r1" });
  assert.equal(res.id, "ok");
  assert.equal(count, 2);
});

Deno.test("JWT: HS256 gültig, falsches Geheimnis und abgelaufen werden abgelehnt", async () => {
  const token = await signJwt("00000000-0000-0000-0000-0000000000aa", {}, "geheim-geheim-geheim-geheim-geheim-1");
  const claims = await verifyJwt(token, { secret: "geheim-geheim-geheim-geheim-geheim-1" });
  assert.equal(claims.sub, "00000000-0000-0000-0000-0000000000aa");
  await assert.rejects(() => verifyJwt(token, { secret: "anderes-geheimnis-anderes-geheimnis" }));
  const old = await signJwt("x", { exp: Math.floor(Date.now() / 1000) - 3600 }, "geheim-geheim-geheim-geheim-geheim-1");
  await assert.rejects(() => verifyJwt(old, { secret: "geheim-geheim-geheim-geheim-geheim-1" }));
});

Deno.test("JWT: ES256 über JWKS (neue Supabase-Schlüssel)", async () => {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const jwk = { ...(await crypto.subtle.exportKey("jwk", pair.publicKey)), kid: "k1", alg: "ES256" };
  const enc = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  const header = enc({ alg: "ES256", kid: "k1", typ: "JWT" });
  const payload = enc({ sub: "u-es", role: "authenticated", exp: Math.floor(Date.now() / 1000) + 60 });
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, pair.privateKey, new TextEncoder().encode(`${header}.${payload}`)));
  const token = `${header}.${payload}.${btoa(String.fromCharCode(...sig)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_")}`;
  const claims = await verifyJwt(token, {
    jwksUrl: "https://auth.fake/jwks",
    fetchFn: () => Promise.resolve(new Response(JSON.stringify({ keys: [jwk] }))),
  });
  assert.equal(claims.sub, "u-es");
});
