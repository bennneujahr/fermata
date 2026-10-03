// GET /functions/v1/waitlist-confirm?t=… – Bestätigungslink aus der Mail (PLAN 2.3 Nr. 1).
// Erfolg: 303 auf /willkommen#t=<Statuslink> (Fragment, landet in keinem Server-Log).
// Ungültig, schon benutzt oder abgelaufen: 303 auf /bestaetigung-abgelaufen.
import { db } from "../_shared/db.ts";
import { siteUrl } from "../_shared/env.ts";
import { handler, redirect } from "../_shared/http.ts";
import { sendMail } from "../_shared/mail/mod.ts";
import { waitlistWelcomeMail } from "../_shared/mail/templates/waitlist.ts";
import { hashToken, issueToken, setting, TOKEN_RE } from "../_shared/waitlist.ts";

interface ConfirmResult {
  result: "ok" | "invalid" | "expired";
  first_name?: string;
  email?: string;
  region_group?: string;
  place?: number;
  is_founding_member?: boolean;
  invite_codes?: string[];
  invited?: boolean;
}

export default handler(["GET"], async (req) => {
  const token = new URL(req.url).searchParams.get("t") ?? "";
  const expired = () => redirect(`${siteUrl()}/bestaetigung-abgelaufen`);
  if (!TOKEN_RE.test(token)) return expired();

  const status = await issueToken();
  const unsubscribe = await issueToken();
  const [row] = await db()`select api.waitlist_confirm(${await hashToken(
    token,
  )}, ${status.hash}, ${unsubscribe.hash}) as r`;
  const r = row!.r as ConfirmResult;
  if (r.result !== "ok") return expired();

  const site = siteUrl();
  const statusUrl = `${site}/willkommen#t=${status.token}`;
  try {
    const [foundingLimit, bonusPlaces] = await Promise.all([
      setting<number>("waitlist.founding_limit"),
      setting<number>("waitlist.bonus_places"),
    ]);
    const code = r.invite_codes?.[0];
    const draft = waitlistWelcomeMail({
      firstName: r.first_name ?? "",
      place: r.place ?? 0,
      regionGroup: r.region_group ?? "anderswo",
      isFoundingMember: !!r.is_founding_member,
      foundingLimit,
      bonusPlaces,
      invited: !!r.invited,
      statusUrl,
      ...(code ? { inviteUrl: `${site}/?e=${code}` } : {}),
      unsubscribeUrl: `${site}/abmelden#u=${unsubscribe.token}`,
    });
    await sendMail({ ...draft, to: r.email! });
  } catch (err) {
    // Die Bestätigung gilt trotzdem; die Willkommensseite zeigt alles Wichtige.
    console.error(JSON.stringify({ level: "error", msg: "waitlist welcome mail failed", error: String(err) }));
  }
  return redirect(statusUrl);
});
