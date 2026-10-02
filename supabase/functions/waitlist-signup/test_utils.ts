// Testhilfen für die Wartelisten-Functions. Tests laufen gegen die Test-Datenbank aus scripts/db.sh
// (Standard: postgres://postgres:postgres@localhost:54332/postgres, siehe docs/bereiche/landing.md).
import postgres from "postgres";
import { setDb, type Sql } from "../_shared/db.ts";
import { type MailMessage, MemoryMailer, setMailer } from "../_shared/mail/mod.ts";

export const DB_URL = Deno.env.get("DATABASE_URL") ?? "postgres://postgres:postgres@localhost:54332/postgres";
export const SITE = "https://fermata.test";
export const FUNCTIONS = "https://functions.fermata.test/functions/v1";
export const CONSENT_VERSION = "warteliste-2026-10-03-entwurf";

export function setup(): { sql: Sql; mailer: MemoryMailer } {
  Deno.env.set("FERMATA_ENV", "test");
  Deno.env.set("FERMATA_SITE_URL", SITE);
  Deno.env.set("FERMATA_FUNCTIONS_URL", FUNCTIONS);
  Deno.env.set("FERMATA_ALLOWED_ORIGINS", SITE);
  Deno.env.delete("LINK_HIT_SECRET");
  const sql = postgres(DB_URL, { max: 2, onnotice: () => {}, prepare: false });
  setDb(sql);
  const mailer = new MemoryMailer();
  setMailer(mailer);
  return { sql, mailer };
}

/** Leert die Wartelisten-Tabellen. Verweigert alles außer Test-Datenbanken. */
export async function reset(sql: Sql, mailer?: MemoryMailer): Promise<void> {
  const [row] = await sql`select ops.environment() as env`;
  if (!["test", "local", "ci"].includes(row!.env)) throw new Error(`Keine Test-Datenbank (Umgebung ${row!.env})`);
  await sql`delete from public.waitlist`;
  await sql`update public.waitlist_counters set last_number = 0`;
  await sql`delete from public.signup_attempts`;
  await sql`delete from public.link_hits`;
  await sql`select ops.sim_clock_reset()`;
  await setSetting(sql, "waitlist.rate_limit_per_hour", 1000);
  await setSetting(sql, "landing.poster_codes", null);
  if (mailer) mailer.sent.length = 0;
}

export async function setSetting(sql: Sql, key: string, value: unknown): Promise<void> {
  await sql`update ops.app_settings set value = (${JSON.stringify(value)}::text)::jsonb where key = ${key}`;
}

export function post(fn: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`http://localhost/functions/v1/${fn}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: SITE, ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

export function signupBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    first_name: "Anna",
    email: "anna@example.org",
    region: "schwerin",
    postal_code: "19053",
    consent: true,
    consent_version: CONSENT_VERSION,
    source: null,
    invite: null,
    website: "",
    fill_ms: 5000,
    ...overrides,
  };
}

export function confirmToken(mail: MailMessage | undefined): string {
  const m = /waitlist-confirm\?t=([A-Za-z0-9_-]{43})/.exec(mail?.text ?? "");
  if (!m) throw new Error("Kein Bestätigungslink in der Mail");
  return m[1]!;
}

export function fragmentToken(url: string, key: "t" | "u"): string {
  const m = new RegExp(`#${key}=([A-Za-z0-9_-]{43})`).exec(url);
  if (!m) throw new Error(`Kein #${key}= in ${url}`);
  return m[1]!;
}

/** Am Ende jeder Testdatei: Startwerte zurück, Daten leeren, Verbindung schließen. */
export async function teardown(sql: Sql, mailer?: MemoryMailer): Promise<void> {
  await reset(sql, mailer);
  await setSetting(sql, "waitlist.rate_limit_per_hour", 5);
  await sql.end();
}

/** Deno-Test ohne Ressourcen-Prüfung (die Datenbankverbindung bleibt für alle Tests offen). */
export function dbTest(name: string, fn: () => Promise<void>): void {
  Deno.test({ name, fn, sanitizeOps: false, sanitizeResources: false });
}
