// Ersatz-Versand für local, test und ci: Mails landen in ops.mail_outbox statt beim Anbieter.
import type { Sql } from "../db.ts";
import type { MailMessage, Mailer } from "./types.ts";

export class OutboxMailer implements Mailer {
  readonly name = "outbox";
  constructor(private sql: Sql) {}

  async send(msg: MailMessage): Promise<{ id: string }> {
    const [row] = await this.sql`
      insert into ops.mail_outbox (recipient, subject, template, html, text)
      values (${msg.to}, ${msg.subject}, ${msg.template}, ${msg.html}, ${msg.text})
      returning id`;
    return { id: `outbox-${row!.id}` };
  }
}

/** Für Unit-Tests ohne Datenbank. */
export class MemoryMailer implements Mailer {
  readonly name = "memory";
  sent: MailMessage[] = [];
  send(msg: MailMessage): Promise<{ id: string }> {
    this.sent.push(msg);
    return Promise.resolve({ id: `memory-${this.sent.length}` });
  }
}
