// Mailversand: Brevo in production/staging, sonst ops.mail_outbox.
// Jede Mail wird ohne Inhalt in ops.notifications_log protokolliert.
import { db } from "../db.ts";
import { environment, optionalEnv } from "../env.ts";
import { BrevoMailer } from "./brevo.ts";
import { OutboxMailer } from "./outbox.ts";
import type { MailMessage, Mailer } from "./types.ts";

export type { MailMessage, Mailer } from "./types.ts";
export { renderMail } from "./layout.ts";
export { MemoryMailer } from "./outbox.ts";

let override: Mailer | undefined;

/** Nur für Tests. */
export function setMailer(m: Mailer | undefined): void {
  override = m;
}

export function mailer(): Mailer {
  if (override) return override;
  const key = optionalEnv("BREVO_API_KEY");
  const env = environment();
  if (key && (env === "production" || env === "staging")) {
    return new BrevoMailer(key, {
      email: optionalEnv("MAIL_FROM_ADDRESS") ?? "hallo@fermata.example",
      name: optionalEnv("MAIL_FROM_NAME") ?? "Fermata",
    });
  }
  if (env === "production") throw new Error("BREVO_API_KEY fehlt in Produktion");
  return new OutboxMailer(db());
}

export async function sendMail(msg: MailMessage, userId?: string): Promise<{ id: string }> {
  const m = mailer();
  const result = await m.send(msg);
  if (m.name !== "memory") {
    await db()`
      insert into ops.notifications_log (user_id, channel, template, purpose, provider, provider_id)
      values (${userId ?? null}, 'email', ${msg.template}, ${msg.purpose ?? null}, ${m.name}, ${result.id})`;
  }
  return result;
}
