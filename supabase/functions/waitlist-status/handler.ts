// POST /functions/v1/waitlist-status {"t": "<Statuslink>"} – Daten für /willkommen.
// POST statt GET, damit der Link in keinem Server-Log steht.
import { z } from "zod";
import { db } from "../_shared/db.ts";
import { handler, HttpError, json, readJson } from "../_shared/http.ts";
import { hashToken, setting, TOKEN_RE } from "../_shared/waitlist.ts";

const Body = z.object({ t: z.string().max(100) });

export default handler(["POST"], async (req) => {
  const parsed = Body.safeParse(await readJson(req, 1024));
  if (!parsed.success) throw new HttpError(400, "invalid_body");
  if (!TOKEN_RE.test(parsed.data.t)) return json(req, { error: "not_found" }, 404);

  const [row] = await db()`select api.waitlist_status(${await hashToken(parsed.data.t)}) as r`;
  if (!row?.r) return json(req, { error: "not_found" }, 404);
  const s = row.r as Record<string, unknown>;
  const foundingLimit = await setting<number>("waitlist.founding_limit");
  return json(req, {
    first_name: s.first_name,
    region_group: s.region_group,
    place: s.place,
    is_founding_member: s.is_founding_member,
    founding_limit: foundingLimit,
    bonus_steps: s.bonus_steps,
    bonus_places: s.bonus_places,
    confirmed_at: s.confirmed_at,
    invited_to_app: s.invited_to_app,
    invites: s.invites,
  });
});
