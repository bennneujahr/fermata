// Versand der Sicherheits-Mails aus safety.mail_queue. Die Empfängeradresse wird erst hier aufgelöst
// (Mitglied: auth.users, Hinweise an Benn: safety.admin_alert_email). Ein Fehlversuch wird vermerkt und
// beim nächsten Lauf wiederholt (höchstens safety.mail_max_attempts).
import type { Sql } from "../_shared/db.ts";
import { appUrl } from "../_shared/env.ts";
import { sendMail } from "../_shared/mail/mod.ts";
import { safetyMailTemplates } from "../_shared/mail/templates/safety.ts";

export async function dispatchSafetyMails(sql: Sql, limit = 50): Promise<{ sent: number; failed: number }> {
  const [setting] = await sql`select ops.setting_text('safety.heimwegtelefon_number') as n`;
  const ctx = { appUrl: appUrl(), helpNumber: setting?.n ?? undefined };
  const rows = await sql`select * from safety.dispatch_claim(${limit})`;
  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    const render = safetyMailTemplates[row.template as string];
    try {
      if (!render) throw new Error(`Unbekannte Vorlage ${row.template}`);
      if (!row.recipient) throw new Error("Kein Empfänger");
      const msg = render((row.data ?? {}) as Record<string, unknown>, ctx);
      const res = await sendMail({ to: row.recipient as string, ...msg }, (row.recipient_user as string | null) ?? undefined);
      await sql`select safety.dispatch_done(${row.id}::bigint, ${res.id}, null)`;
      sent++;
    } catch (err) {
      failed++;
      await sql`select safety.dispatch_done(${row.id}::bigint, null, ${String((err as Error)?.message ?? err).slice(0, 300)})`;
    }
  }
  return { sent, failed };
}
