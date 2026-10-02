// POST /functions/v1/waitlist-unsubscribe {"t": "<Abmelde- oder Statuslink>"} – löscht den Eintrag.
// Die Seite /abmelden fragt vorher nach (Mail-Scanner, die Links öffnen, melden so niemanden ab).
// Antwort immer {"ok": true}: Das Ergebnis ist in jedem Fall „nicht (mehr) auf der Liste“.
import { z } from "zod";
import { db } from "../_shared/db.ts";
import { handler, HttpError, json, readJson } from "../_shared/http.ts";
import { hashToken, TOKEN_RE } from "../_shared/waitlist.ts";

const Body = z.object({ t: z.string().max(100) });

export default handler(["POST"], async (req) => {
  const parsed = Body.safeParse(await readJson(req, 1024));
  if (!parsed.success) throw new HttpError(400, "invalid_body");
  if (TOKEN_RE.test(parsed.data.t)) {
    await db()`select api.waitlist_unsubscribe(${await hashToken(parsed.data.t)})`;
  }
  return json(req, { ok: true });
});
