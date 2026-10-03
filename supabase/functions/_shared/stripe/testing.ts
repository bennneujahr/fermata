// Hilfen für Deno-Tests der Functions billing-*, stripe-webhook, safety-dispatch, trust-view.
// Datenbank-Tests laufen nur, wenn SUPABASE_DB_URL (oder DATABASE_URL) gesetzt ist (Test-Datenbank aus scripts/db.sh).
import postgres from "postgres";
import { encodeBase64Url } from "@std/encoding";
import { setDb, type Sql } from "../db.ts";
import { MemoryMailer, setMailer } from "../mail/mod.ts";
import { setStripe, StripeClient } from "./client.ts";

export const TEST_DB_URL = Deno.env.get("SUPABASE_DB_URL") ?? Deno.env.get("DATABASE_URL");
export const hasDb = Boolean(TEST_DB_URL);
export const JWT_SECRET = "fermata-test-jwt-secret-mit-mindestens-32-zeichen";
export const WEBHOOK_SECRET = "whsec_fermata_test";
export const INTERNAL_SECRET = "fermata-internal-test";
export const STRIPE_MOCK_URL = Deno.env.get("STRIPE_MOCK_URL") ?? "http://localhost:54383";

export function setupEnv(): void {
  Deno.env.set("SUPABASE_JWT_SECRET", JWT_SECRET);
  Deno.env.set("STRIPE_WEBHOOK_SECRET", WEBHOOK_SECRET);
  Deno.env.set("FERMATA_INTERNAL_SECRET", INTERNAL_SECRET);
  Deno.env.set("FERMATA_ENV", "test");
  Deno.env.set("FERMATA_APP_URL", "https://app.fermata.test");
  Deno.env.set("FERMATA_FUNCTIONS_URL", "https://fn.fermata.test/functions/v1");
  Deno.env.set("STRIPE_SECRET_KEY", "sk_test_123");
}

export function testSql(): Sql {
  const sql = postgres(TEST_DB_URL!, { max: 2, prepare: false, onnotice: () => {} });
  setDb(sql);
  return sql;
}

export function useMemoryMailer(): MemoryMailer {
  const m = new MemoryMailer();
  setMailer(m);
  return m;
}

export async function signJwt(sub: string, extra: Record<string, unknown> = {}, secret = JWT_SECRET): Promise<string> {
  const enc = (o: unknown) => encodeBase64Url(new TextEncoder().encode(JSON.stringify(o)));
  const header = enc({ alg: "HS256", typ: "JWT" });
  const payload = enc({ sub, role: "authenticated", aal: "aal1", exp: Math.floor(Date.now() / 1000) + 3600, ...extra });
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${header}.${payload}`)));
  return `${header}.${payload}.${encodeBase64Url(sig)}`;
}

export interface MemberFixture {
  id: string;
  email: string;
}

/** Legt eine Person an wie die Web-App: Konto, Fakten, Mitgliedschaft (free), Gratis-Abend. */
export async function createMember(
  sql: Sql,
  opts: { firstName?: string; lastName?: string; freeGrant?: number; freePhaseEnded?: boolean } = {},
): Promise<MemberFixture> {
  const id = crypto.randomUUID();
  const email = `t-${id.slice(0, 8)}@example.test`;
  await sql`insert into auth.users (id, email, aud, role, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
            values (${id}::uuid, ${email}, 'authenticated', 'authenticated', now(), now(), '{}'::jsonb, '{}'::jsonb)`;
  await sql`insert into app.accounts (user_id, status) values (${id}::uuid, 'active')`;
  await sql`insert into private.account_facts (user_id, first_name, last_name, birth_date, postal_code)
            values (${id}::uuid, ${opts.firstName ?? "Test"}, ${opts.lastName ?? "Person"}, '1990-01-01', '19053')`;
  await sql`insert into billing.memberships (user_id, free_phase_ended_at)
            values (${id}::uuid, ${opts.freePhaseEnded ? new Date().toISOString() : null}::timestamptz)`;
  if ((opts.freeGrant ?? 1) > 0) {
    await sql`insert into billing.evening_ledger (user_id, kind, amount, note) values (${id}::uuid, 'free_grant', ${opts.freeGrant ?? 1}, 'Gratis-Abend')`;
  }
  return { id, email };
}

export async function deleteUsers(sql: Sql, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await sql`delete from safety.mail_queue where recipient_user = any(${ids}::uuid[])`;
  await sql`delete from auth.users where id = any(${ids}::uuid[])`;
}

// ---------------------------------------------------------------------------
// Stripe-Ersatz für Tests ohne stripe-mock (und um Aufrufe genau zu prüfen)
// ---------------------------------------------------------------------------
export interface StripeCall {
  method: string;
  path: string;
  params: URLSearchParams;
  headers: Record<string, string>;
}

type Responder = (method: string, path: string, params: URLSearchParams) => { status?: number; body: unknown } | undefined;

export function fakeStripe(responder?: Responder): { client: StripeClient; calls: StripeCall[] } {
  const calls: StripeCall[] = [];
  let n = 0;
  const fetchFn: typeof fetch = (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const params = method === "GET" ? url.searchParams : new URLSearchParams(String(init?.body ?? ""));
    calls.push({ method, path: url.pathname, params, headers: (init?.headers ?? {}) as Record<string, string> });
    const custom = responder?.(method, url.pathname, params);
    let res: { status?: number; body: unknown };
    if (custom) {
      res = custom;
    } else if (method === "POST" && url.pathname === "/v1/customers") {
      res = { body: { id: `cus_fake_${++n}` } };
    } else if (method === "GET" && url.pathname === "/v1/prices") {
      res = { body: { data: [{ id: "price_fake" }] } };
    } else if (method === "POST" && url.pathname === "/v1/products") {
      res = { body: { id: "prod_fake" } };
    } else if (method === "POST" && url.pathname === "/v1/prices") {
      res = { body: { id: "price_fake_new" } };
    } else if (method === "POST" && url.pathname === "/v1/subscriptions") {
      res = { body: { id: `sub_fake_${++n}`, status: "incomplete", latest_invoice: { confirmation_secret: { client_secret: "pi_fake_secret_abc" } } } };
    } else if (url.pathname.startsWith("/v1/subscriptions/")) {
      res = { body: { id: url.pathname.split("/").pop(), status: method === "DELETE" ? "canceled" : "active" } };
    } else if (method === "POST" && url.pathname === "/v1/refunds") {
      res = { body: { id: `re_fake_${++n}`, amount: Number(params.get("amount")) } };
    } else if (url.pathname.startsWith("/v1/invoices/")) {
      res = { body: { id: url.pathname.split("/").pop(), payments: { data: [{ payment: { payment_intent: "pi_from_invoice" } }] } } };
    } else {
      res = { status: 404, body: { error: { type: "invalid_request_error", message: "unbekannt" } } };
    }
    return Promise.resolve(new Response(JSON.stringify(res.body), { status: res.status ?? 200, headers: { "content-type": "application/json" } }));
  };
  const client = new StripeClient({ secretKey: "sk_test_fake", apiBase: "https://stripe.fake", fetchFn, maxRetries: 0 });
  setStripe(client);
  return { client, calls };
}

export async function stripeMockAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${STRIPE_MOCK_URL}/v1/customers?limit=1`, { headers: { authorization: "Bearer sk_test_123" } });
    await res.body?.cancel();
    return res.ok;
  } catch {
    return false;
  }
}

export function request(path: string, init: RequestInit & { json?: unknown; token?: string } = {}): Request {
  const headers = new Headers(init.headers);
  if (init.json !== undefined) headers.set("content-type", "application/json");
  if (init.token) headers.set("authorization", `Bearer ${init.token}`);
  return new Request(`https://fn.fermata.test/functions/v1/${path}`, {
    method: init.method ?? (init.json !== undefined ? "POST" : "GET"),
    headers,
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
  });
}

/** Bestellung und erste Zahlung wie im echten Ablauf (record_order + invoice.paid). */
export async function activateMember(
  sql: Sql,
  userId: string,
  opts: { tier?: string; amountCents?: number; withPaymentIntent?: boolean } = {},
): Promise<{ contractNumber: string; subscriptionId: string; customerId: string; invoiceId: string }> {
  const tag = userId.slice(0, 8);
  const tier = opts.tier ?? "andante";
  const subscriptionId = `sub_t_${tag}`, customerId = `cus_t_${tag}`, invoiceId = `in_t_${tag}`;
  const [o] = await sql`select billing.record_order(${userId}::uuid, ${tier}, billing.order_summary(${tier}), ${customerId}, ${subscriptionId}) as r`;
  await sql`select billing.apply_invoice_paid(${subscriptionId}, ${customerId}, ${invoiceId}, now(), now() + interval '28 days',
            ${opts.amountCents ?? 14900}::integer, ${opts.withPaymentIntent === false ? null : `pi_t_${tag}`})`;
  return { contractNumber: (o!.r as Record<string, string>).contract_number!, subscriptionId, customerId, invoiceId };
}

/** Abend zwischen zwei Personen anlegen und optional bestätigen bzw. stattfinden lassen. */
export async function createEvening(
  sql: Sql,
  a: string,
  b: string,
  opts: { startsInHours?: number; state?: "proposed" | "confirmed" | "happened"; venueName?: string } = {},
): Promise<string> {
  const [lo, hi] = a < b ? [a, b] : [b, a];
  const [run] = await sql`insert into app.match_runs (scheduled_for, status) values (now(), 'approved') returning id`;
  const [venue] = await sql`insert into app.venues (name, street, postal_code, city, lat, lon)
                            values (${opts.venueName ?? "Testlokal"}, 'Teststraße 1', '19053', 'Schwerin', 53.6, 11.4) returning id`;
  const [p] = await sql`insert into app.pairings (run_id, user_a, user_b, total_score, status)
                        values (${run!.id}, ${lo}::uuid, ${hi}::uuid, 0.8, 'proposed') returning id`;
  const [e] = await sql`insert into app.evenings (pairing_id, user_a, user_b, starts_at, venue_id)
                        values (${p!.id}, ${lo}::uuid, ${hi}::uuid, now() + make_interval(hours => ${opts.startsInHours ?? 48}), ${venue!.id})
                        returning id`;
  const state = opts.state ?? "confirmed";
  if (state !== "proposed") {
    await sql`select app.evening_transition(${e!.id}::uuid, 'request_time', ${lo}::uuid)`;
    await sql`select app.evening_transition(${e!.id}::uuid, 'confirm', ${hi}::uuid)`;
  }
  if (state === "happened") await sql`select app.evening_transition(${e!.id}::uuid, 'happened')`;
  return e!.id as string;
}

export async function cleanupEvenings(sql: Sql, userIds: string[]): Promise<void> {
  const runs = await sql`select distinct p.run_id, e.venue_id from app.evenings e join app.pairings p on p.id = e.pairing_id
                         where e.user_a = any(${userIds}::uuid[]) or e.user_b = any(${userIds}::uuid[])`;
  await deleteUsers(sql, userIds);
  for (const r of runs) {
    await sql`delete from app.match_runs where id = ${r.run_id} and not exists (select 1 from app.pairings where run_id = ${r.run_id})`;
    if (r.venue_id) await sql`delete from app.venues where id = ${r.venue_id} and not exists (select 1 from app.evenings where venue_id = ${r.venue_id})`;
  }
}
