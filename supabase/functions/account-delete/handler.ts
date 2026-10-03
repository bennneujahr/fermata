// POST /functions/v1/account-delete – Konto löschen (Art. 17 DSGVO). Body: { "confirm": true }
// 1. ops.account_deletion_prepare: Audit, Einladungen und Protokolle entfernen, Sicherheits-Hinweis bei laufender Prüfung.
// 2. Supabase Auth löscht die Person; alle Tabellen mit on delete cascade folgen,
//    gesetzlich Nötiges bleibt ohne Personenbezug (z. B. billing.contract_actions.user_id = null).
// 3. Nachweis im Audit, Bestätigung per Mail.
import { z } from "zod";
import { requireUser } from "../_shared/auth.ts";
import { db } from "../_shared/db.ts";
import { rethrowDbError } from "../_shared/dberror.ts";
import { optionalEnv } from "../_shared/env.ts";
import { adminDeleteUser } from "../_shared/gotrue.ts";
import { handler, HttpError, json, readJson } from "../_shared/http.ts";
import { sendMail } from "../_shared/mail/mod.ts";
import { accountDeletedMail } from "../_shared/mail/templates/account.ts";

const Body = z.object({ confirm: z.literal(true) });

export default handler(["POST"], async (req) => {
  const user = await requireUser(req);
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) throw new HttpError(422, "confirmation_required");

  const sql = db();
  let info: { email: string; first_name: string | null; address_form: "sie" | "du" };
  try {
    const [row] = await sql`select ops.account_deletion_prepare(${user.id}::uuid) as r`;
    info = row!.r as typeof info;
  } catch (err) {
    rethrowDbError(err);
  }

  await adminDeleteUser(user.id);
  const [done] = await sql`select ops.account_deletion_done(${user.id}::uuid) as ok`;

  let mailSent = true;
  try {
    await sendMail(accountDeletedMail({
      to: info.email,
      firstName: info.first_name,
      addressForm: info.address_form,
      contactEmail: optionalEnv("FERMATA_CONTACT_EMAIL"),
    }));
  } catch (err) {
    mailSent = false;
    console.error(JSON.stringify({ level: "error", msg: "deletion_mail_failed", err: String(err) }));
  }
  return json(req, { deleted: Boolean(done!.ok), mail_sent: mailSent });
});
