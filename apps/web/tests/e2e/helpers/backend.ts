// Direkter Zugriff auf den lokalen Stapel für Testdaten (GoTrue-Admin-API, Datenbank, Mailpit).
import postgres from "postgres";
import { stack } from "./env";

export const sql = postgres(stack.SUPABASE_DB_URL ?? "postgres://postgres:postgres@localhost:54342/postgres", { max: 2, onnotice: () => {} });

const authHeaders = () => ({
  apikey: stack.SUPABASE_SERVICE_ROLE_KEY!,
  authorization: `Bearer ${stack.SUPABASE_SERVICE_ROLE_KEY}`,
  "content-type": "application/json",
});

export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}@e2e.fermata.test`;
}

export async function createAuthUser(email: string): Promise<string> {
  const res = await fetch(`${stack.SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ email, email_confirm: true }),
  });
  if (!res.ok) throw new Error(`GoTrue ${res.status}: ${await res.text()}`);
  return ((await res.json()) as { id: string }).id;
}

/** Admin anlegen (Konto in Auth + app.admin_users). */
export async function createAdmin(email: string, name = "Benn (Test)"): Promise<string> {
  const id = await createAuthUser(email);
  await sql`insert into app.admin_users (user_id, display_name) values (${id}::uuid, ${name})`;
  return id;
}

/** Eingeladenes Mitglied (wie admin-invite, ohne Mail). */
export async function createInvitedMember(email: string, adminId: string): Promise<string> {
  const id = await createAuthUser(email);
  await sql`select ops.create_invited_account(${email}, ${id}::uuid, ${adminId}::uuid)`;
  return id;
}

/** Anmeldelink ohne Mail (GoTrue generate_link → token_hash). */
export async function magicLinkPath(email: string): Promise<string> {
  const res = await fetch(`${stack.SUPABASE_URL}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ type: "magiclink", email }),
  });
  if (!res.ok) throw new Error(`generate_link ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as { hashed_token?: string; properties?: { hashed_token?: string } };
  const hash = body.hashed_token ?? body.properties?.hashed_token;
  return `/anmelden/bestaetigen?token_hash=${hash}&type=email`;
}

interface MailpitMessage {
  ID: string;
  Subject: string;
  To: { Address: string }[];
  Created: string;
}

/** Wartet auf die neueste Mail an diese Adresse (Mailpit) und liefert Text und HTML. */
export async function waitForMail(to: string, subjectIncludes: string, after = 0): Promise<{ text: string; html: string }> {
  const base = stack.MAILPIT_URL ?? "http://localhost:54347";
  for (let i = 0; i < 40; i++) {
    const res = await fetch(`${base}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
    const data = (await res.json()) as { messages: MailpitMessage[] };
    const msg = data.messages.find((m) => m.Subject.includes(subjectIncludes) && new Date(m.Created).getTime() >= after);
    if (msg) {
      const full = (await (await fetch(`${base}/api/v1/message/${msg.ID}`)).json()) as { Text: string; HTML: string };
      return { text: full.Text, html: full.HTML };
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Keine Mail an ${to} mit „${subjectIncludes}“`);
}

export function codeFromMail(mail: { text: string; html: string }): string {
  const m = /\b(\d{6})\b/.exec(mail.text || mail.html.replace(/<[^>]+>/g, " "));
  if (!m) throw new Error("Kein Code in der Mail");
  return m[1]!;
}

export async function outboxMail(to: string, template: string): Promise<{ subject: string; text: string } | undefined> {
  const [row] = await sql`select subject, text from ops.mail_outbox where recipient = ${to} and template = ${template} order by id desc limit 1`;
  return row as { subject: string; text: string } | undefined;
}
