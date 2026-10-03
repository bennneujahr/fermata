// Test-Hilfen für die Web-App-Functions (account-*, verification-*, admin-invite).
// Läuft gegen die Test-Datenbank (scripts/db.sh, Umgebung test) und ersetzt Supabase Auth durch eine Attrappe.
// Aufruf: SUPABASE_DB_URL=postgres://postgres:postgres@localhost:54342/postgres deno test --allow-env --allow-net --allow-read
import postgres from "postgres";
import { encodeBase64Url } from "@std/encoding";
import { setAuthFetch } from "./auth.ts";
import { setDb, type Sql } from "./db.ts";
import { setDidit, FakeDiditClient } from "./didit/mod.ts";
import { MemoryMailer, setMailer } from "./mail/mod.ts";

export const DB_URL = Deno.env.get("SUPABASE_DB_URL") ?? Deno.env.get("TEST_DB_URL") ?? "";

Deno.env.set("SUPABASE_URL", "http://auth.fermata.test");
Deno.env.set("SUPABASE_ANON_KEY", "anon-key");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-key");
Deno.env.set("FERMATA_ENV", "test");
Deno.env.set("FERMATA_APP_URL", "http://localhost:3041");
Deno.env.set("DIDIT_MODE", "fake");
Deno.env.set("DIDIT_WEBHOOK_SECRET", "test-webhook-secret");
if (DB_URL) Deno.env.set("SUPABASE_DB_URL", DB_URL);

/** Unsigniertes JWT (die Attrappe von Supabase Auth prüft es; die Functions lesen danach nur die Claims). */
export function fakeJwt(sub: string, aal: "aal1" | "aal2" = "aal1"): string {
  const enc = (o: unknown) => encodeBase64Url(new TextEncoder().encode(JSON.stringify(o)));
  return `${enc({ alg: "none", typ: "JWT" })}.${enc({ sub, aal, role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })}.x`;
}

export interface TestEnv {
  sql: Sql;
  mailer: MemoryMailer;
  didit: FakeDiditClient;
  /** token → Person (für GET /auth/v1/user) */
  users: Map<string, { id: string; email: string }>;
  authCalls: { method: string; path: string }[];
}

export function setupWebTests(): TestEnv {
  const sql = (DB_URL ? postgres(DB_URL, { max: 2, onnotice: () => {}, prepare: false }) : undefined) as Sql;
  if (sql) setDb(sql);
  const mailer = new MemoryMailer();
  setMailer(mailer);
  const fake = new FakeDiditClient("http://localhost:3041");
  setDidit(fake);
  const users = new Map<string, { id: string; email: string }>();
  const authCalls: { method: string; path: string }[] = [];
  setAuthFetch(async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = (init?.method ?? "GET").toUpperCase();
    authCalls.push({ method, path: url.pathname });
    const auth = new Headers(init?.headers).get("authorization") ?? "";
    if (url.pathname === "/auth/v1/user") {
      const u = users.get(auth.replace(/^Bearer /, ""));
      return u ? Response.json({ id: u.id, email: u.email }) : new Response("{}", { status: 401 });
    }
    if (auth !== "Bearer service-key") return new Response("{}", { status: 401 });
    if (url.pathname === "/auth/v1/admin/users" && method === "POST") {
      const body = JSON.parse(String(init?.body ?? "{}"));
      const [row] = await sql`
        insert into auth.users (id, email, aud, role, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
        values (gen_random_uuid(), ${body.email}, 'authenticated', 'authenticated', now(), now(), now(), '{}', '{}') returning id`;
      return Response.json({ id: row!.id, email: body.email });
    }
    const del = /^\/auth\/v1\/admin\/users\/([0-9a-f-]+)$/.exec(url.pathname);
    if (del && method === "DELETE") {
      await sql`delete from auth.users where id = ${del[1]!}::uuid`;
      return Response.json({});
    }
    return new Response("{}", { status: 404 });
  });
  return { sql, mailer, didit: fake, users, authCalls };
}

export function dbTest(name: string, fn: () => Promise<void>): void {
  Deno.test({ name, ignore: !DB_URL, sanitizeOps: false, sanitizeResources: false, fn });
}

/** Legt eine Person mit Konto an und liefert ID und Token. */
export async function createMember(env: TestEnv, email: string, aal: "aal1" | "aal2" = "aal1"): Promise<{ id: string; token: string }> {
  const [row] = await env.sql`
    insert into auth.users (id, email, aud, role, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    values (gen_random_uuid(), ${email}, 'authenticated', 'authenticated', now(), now(), '{}', '{}') returning id`;
  const id = row!.id as string;
  await env.sql`select app.on_account_created(${id}::uuid)`;
  const token = fakeJwt(id, aal);
  env.users.set(token, { id, email });
  return { id, token };
}

/** Einwilligungen, Formular und Identität wie in der Web-App (als die Person). */
export async function onboard(env: TestEnv, id: string, facts: { first: string; last: string; birth: string; plz?: string },
  kinds = ["agb", "datenschutz_kenntnis", "art9_profile", "biometrie"]): Promise<void> {
  await env.sql.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: id, role: "authenticated", aal: "aal1" })}, true)`;
    await tx`set local role authenticated`;
    for (const k of kinds) await tx`select api.give_consent(${k}, (select d.version from api.legal_document(${k}) d))`;
    await tx`select api.save_facts(${facts.first}, ${facts.last}, ${facts.birth}::date, ${facts.plz ?? "19053"})`;
    await tx`select api.save_identity('frau', array['mann'])`;
  });
}

export async function cleanup(env: TestEnv, domain: string): Promise<void> {
  await env.sql`delete from app.account_invitations where email::text like ${"%@" + domain}`;
  await env.sql`delete from auth.users where email like ${"%@" + domain}`;
  env.mailer.sent.length = 0;
  env.didit.created.length = 0;
  env.didit.deleted.length = 0;
  env.didit.failDelete = false;
}

export function req(path: string, init: { method?: string; token?: string; body?: unknown; headers?: Record<string, string> } = {}): Request {
  const headers = new Headers(init.headers ?? {});
  if (init.token) headers.set("authorization", `Bearer ${init.token}`);
  if (init.body !== undefined && !headers.has("content-type")) headers.set("content-type", "application/json");
  return new Request(`http://localhost/functions/v1/${path}`, {
    method: init.method ?? "POST",
    headers,
    body: init.body === undefined ? undefined : typeof init.body === "string" ? init.body : JSON.stringify(init.body),
  });
}

export { encodeBase64Url };
