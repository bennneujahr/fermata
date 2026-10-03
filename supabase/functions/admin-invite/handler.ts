// POST /functions/v1/admin-invite – Einladung aus dem Admin (PLAN 2.3 Nr. 3). Body: { email, waitlist_id? }
// Nur Admins mit Zwei-Faktor (aal2). Legt die Person in Supabase Auth an (E-Mail bestätigt, Anmeldung per Code),
// hält die Einladung fest (ops.create_invited_account → app.on_account_created, Warteliste markieren)
// und schickt die Einladung über _shared/mail (Brevo bzw. ops.mail_outbox).
import { z } from "zod";
import { requireUser } from "../_shared/auth.ts";
import { db } from "../_shared/db.ts";
import { rethrowDbError } from "../_shared/dberror.ts";
import { appUrl, optionalEnv } from "../_shared/env.ts";
import { adminCreateUser, adminDeleteUser } from "../_shared/gotrue.ts";
import { handler, HttpError, json, readJson } from "../_shared/http.ts";
import { sendMail } from "../_shared/mail/mod.ts";
import { inviteMail } from "../_shared/mail/templates/account.ts";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const Body = z.object({
  email: z.string().trim().toLowerCase().max(254).regex(EMAIL_RE),
  waitlist_id: z.uuid().nullish(),
});

export default handler(["POST"], async (req) => {
  const admin = await requireUser(req);
  if (admin.aal !== "aal2") throw new HttpError(403, "admin_aal2_required");
  const sql = db();
  const [isAdmin] = await sql`select ops.is_admin_user(${admin.id}::uuid) as ok`;
  if (!isAdmin!.ok) throw new HttpError(403, "admin_aal2_required");

  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) throw new HttpError(422, "invalid_email");
  const { email, waitlist_id } = parsed.data;

  const [existing] = await sql`select id from auth.users where lower(email) = ${email} limit 1`;
  let userId = existing?.id as string | undefined;
  const created = !userId;
  if (!userId) userId = await adminCreateUser(email);

  let result: { invitation_id: string; expires_at: string; is_founding_member: boolean; waitlist_linked: boolean };
  try {
    const [row] = await sql`
      select ops.create_invited_account(${email}, ${userId}::uuid, ${admin.id}::uuid, ${waitlist_id ?? null}::uuid) as r`;
    result = row!.r as typeof result;
  } catch (err) {
    if (created) await adminDeleteUser(userId).catch(() => {});
    rethrowDbError(err);
  }

  let mailSent = true;
  try {
    await sendMail(inviteMail({
      to: email,
      appUrl: appUrl(),
      expiresAt: new Date(result.expires_at),
      contactEmail: optionalEnv("FERMATA_CONTACT_EMAIL"),
    }), userId);
  } catch (err) {
    mailSent = false;
    console.error(JSON.stringify({ level: "error", msg: "invite_mail_failed", err: String(err) }));
  }

  return json(req, {
    invited: true,
    user_id: userId,
    invitation_id: result.invitation_id,
    expires_at: result.expires_at,
    is_founding_member: result.is_founding_member,
    waitlist_linked: result.waitlist_linked,
    mail_sent: mailSent,
  });
});
