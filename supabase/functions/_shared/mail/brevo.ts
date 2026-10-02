// Versand über Brevo (Sitz Frankreich), Transaktions-API v3.
// Im Brevo-Konto müssen Öffnungs- und Klickverfolgung ausgeschaltet sein (docs/RUNBOOK.md).
import type { MailMessage, Mailer } from "./types.ts";

export class BrevoMailer implements Mailer {
  readonly name = "brevo";
  constructor(
    private apiKey: string,
    private from: { email: string; name: string },
    private fetchFn: typeof fetch = fetch,
  ) {}

  async send(msg: MailMessage): Promise<{ id: string }> {
    const res = await this.fetchFn("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": this.apiKey, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        sender: this.from,
        to: [{ email: msg.to, ...(msg.toName ? { name: msg.toName } : {}) }],
        subject: msg.subject,
        htmlContent: msg.html,
        textContent: msg.text,
        tags: [msg.template],
        ...(msg.replyTo ? { replyTo: { email: msg.replyTo } } : {}),
      }),
    });
    if (!res.ok) {
      // Keine Mailadresse ins Log schreiben.
      throw new Error(`Brevo antwortet ${res.status} für Vorlage ${msg.template}`);
    }
    const body = (await res.json()) as { messageId?: string };
    return { id: body.messageId ?? "brevo" };
  }
}
