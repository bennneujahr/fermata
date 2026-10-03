// Nur für Tests der Interview-Functions: Verbindung zur Test-Datenbank, Testpersonen, Tokens.
// Erwartet eine migrierte Test-Datenbank (scripts/db.sh migrate), Standard-Port 54352 (Bereich Viola).
import postgres from "postgres";
import { connect, dbRole, setDb, type Sql } from "../db.ts";
import { signHs256 } from "./jwt.ts";

export const JWT_SECRET = "super-secret-jwt-token-with-at-least-32-characters-long";
export const AGENT_SECRET = "agent-secret-for-tests-0123456789abcdef";
export const LIVEKIT_SECRET = "livekit-secret-for-tests-0123456789abcdef";
export const TEXT_SECRET = "text-secret-for-tests-0123456789abcdef-xyz";

export function setTestEnv(): void {
  Deno.env.set("FERMATA_ENV", "test");
  Deno.env.set("SUPABASE_JWT_SECRET", JWT_SECRET);
  Deno.env.set("INTERVIEW_AGENT_SECRET", AGENT_SECRET);
  Deno.env.set("LIVEKIT_URL", "wss://livekit.fermata.test");
  Deno.env.set("LIVEKIT_API_KEY", "APItest");
  Deno.env.set("LIVEKIT_API_SECRET", LIVEKIT_SECRET);
  Deno.env.set("VIOLA_TEXT_URL", "https://viola.fermata.test");
  Deno.env.set("VIOLA_TEXT_TOKEN_SECRET", TEXT_SECRET);
}

let sqlInstance: Sql | undefined;
let fnInstance: Sql | undefined;
export function testDb(): Sql {
  if (!sqlInstance) {
    const url = Deno.env.get("SUPABASE_DB_URL") ??
      `postgres://postgres:postgres@localhost:${Deno.env.get("DB_PORT") ?? "54352"}/postgres`;
    sqlInstance = postgres(url, { prepare: false, max: 3, onnotice: () => {} });
    // Testdaten als postgres; die Functions selbst laufen wie in Produktion (FERMATA_DB_ROLE=service_role → enge Rolle).
    fnInstance = dbRole() ? connect(url, { max: 3, applicationName: "fermata-edge-test" }) : sqlInstance;
    setDb(fnInstance);
  }
  return sqlInstance;
}

export async function closeDb(): Promise<void> {
  if (fnInstance && fnInstance !== sqlInstance) await fnInstance.end({ timeout: 2 });
  if (sqlInstance) await sqlInstance.end({ timeout: 2 });
  sqlInstance = undefined;
  fnInstance = undefined;
  setDb(undefined);
}

export type Person = { id: string; email: string };

/** Legt eine Person an: Konto, optional geprüft und mit Einwilligung „gespraech“. */
export async function createPerson(
  opts: { verified?: boolean; consent?: boolean; addressForm?: "sie" | "du"; tier?: string } = {},
): Promise<Person> {
  const sql = testDb();
  const id = crypto.randomUUID();
  const email = `p-${id.slice(0, 8)}@example.test`;
  await sql`select tests.create_user(${email}, ${id})`;
  await sql`insert into app.accounts (user_id, status, address_form, tier_view)
            values (${id}, 'active', ${opts.addressForm ?? "sie"}, ${opts.tier ?? "auftakt"})`;
  if (opts.verified ?? true) {
    await sql`insert into app.verifications (user_id, status, is_adult, name_match, birth_date_match)
              values (${id}, 'approved', true, true, true)`;
  }
  if (opts.consent ?? true) {
    await sql`insert into app.consents (user_id, kind, action, document_version) values (${id}, 'gespraech', 'granted', 'test')`;
  }
  return { id, email };
}

export async function removePeople(people: Person[]): Promise<void> {
  const sql = testDb();
  const ids = people.map((p) => p.id);
  if (ids.length === 0) return;
  await sql`delete from safety.safety_flags where user_id = any(${ids}::uuid[])`;
  await sql`delete from ops.session_costs where session_id in (select id from app.interview_sessions where user_id = any(${ids}::uuid[]))`;
  await sql`delete from auth.users where id = any(${ids}::uuid[])`;
}

export async function memberToken(userId: string, extra: Record<string, unknown> = {}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return await signHs256({
    sub: userId,
    role: "authenticated",
    aud: "authenticated",
    aal: "aal1",
    iat: now,
    exp: now + 600,
    ...extra,
  }, JWT_SECRET);
}

export function post(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`http://localhost/functions/v1/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}
