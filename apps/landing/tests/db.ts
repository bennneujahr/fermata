// Datenbankzugang für die Tests (nur Test-Datenbanken: ops.environment() muss test/local/ci sein).
import postgres from "postgres";
import { E2E } from "./env";

export const sql = postgres(E2E.dbUrl, { max: 2, onnotice: () => {}, idle_timeout: 5 });

export async function assertTestDb(): Promise<void> {
  const [row] = await sql`select ops.environment() as env`;
  if (!["test", "local", "ci"].includes(row!.env)) throw new Error(`Keine Test-Datenbank (Umgebung ${row!.env}).`);
}

export async function resetWaitlist(): Promise<void> {
  await assertTestDb();
  await sql`delete from public.waitlist`;
  await sql`update public.waitlist_counters set last_number = 0`;
  await sql`delete from public.signup_attempts`;
  await sql`delete from public.link_hits`;
  await sql`delete from ops.mail_outbox`;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await sql`update ops.app_settings set value = (${JSON.stringify(value)}::text)::jsonb where key = ${key}`;
}

/** Neueste Mail an eine Adresse (Outbox der Testumgebung). */
export async function latestMail(to: string, template?: string): Promise<{ subject: string; text: string; template: string }> {
  for (let i = 0; i < 40; i++) {
    const rows = template
      ? await sql`select subject, text, template from ops.mail_outbox where recipient = ${to} and template = ${template} order by id desc limit 1`
      : await sql`select subject, text, template from ops.mail_outbox where recipient = ${to} order by id desc limit 1`;
    if (rows[0]) return rows[0] as never;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Keine Mail an ${to}`);
}

export function confirmLinkFrom(text: string): string {
  const m = /(http:\/\/localhost:\d+\/functions\/v1\/waitlist-confirm\?t=[A-Za-z0-9_-]{43})/.exec(text);
  if (!m) throw new Error("Kein Bestätigungslink in der Mail");
  return m[1]!;
}
