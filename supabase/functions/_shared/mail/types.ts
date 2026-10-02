export interface MailMessage {
  to: string;
  toName?: string;
  subject: string;
  html: string;
  text: string;
  /** Vorlagen-Kennung, z. B. "waitlist.confirm" (für Protokoll und Tests). */
  template: string;
  /** Ohne Personenbezug: wofür die Mail ist (Protokoll in ops.notifications_log). */
  purpose?: string;
  replyTo?: string;
}

export interface Mailer {
  readonly name: string;
  send(msg: MailMessage): Promise<{ id: string }>;
}
