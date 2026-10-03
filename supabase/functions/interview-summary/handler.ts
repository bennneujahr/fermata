// interview-summary: Das Mitglied liest den Entwurf der Zusammenfassung und bestätigt, korrigiert oder verwirft ihn.
// GET  ?session_id=…                           → Entwurf und Status
// POST {session_id, action, text?}             → api.interview_confirm_summary (als Mitglied, RLS gilt)
// Eine Korrektur mit Art.-9-Inhalt wird abgelehnt (422 art9_content, message = betroffene Kategorien).
import { db } from "../_shared/db.ts";
import { handler, HttpError, json, readJson } from "../_shared/http.ts";
import { authenticateMember, isUuid } from "../_shared/interview/auth.ts";
import { asMember } from "../_shared/interview/db.ts";

type Body = { session_id?: unknown; action?: unknown; text?: unknown };

export default handler(["GET", "POST"], async (req) => {
  const claims = await authenticateMember(req);

  if (req.method === "GET") {
    const sid = new URL(req.url).searchParams.get("session_id");
    if (!isUuid(sid)) throw new HttpError(400, "invalid_session_id");
    const row = await asMember(db(), claims, async (tx) => {
      const rows = await tx`
        select s.id as session_id, s.kind, s.status, s.summary_status, s.summary_draft, s.summary_confirmed_at,
               s.covered_blocks, s.end_reason, s.address_form, s.analysis_status,
               (select pc.summary_version from app.profile_core pc where pc.user_id = s.user_id) as summary_version
          from app.interview_sessions s where s.id = ${sid}`;
      return rows[0];
    });
    if (!row) throw new HttpError(404, "session_not_found");
    return json(req, row);
  }

  const body = await readJson<Body>(req);
  if (!isUuid(body.session_id)) throw new HttpError(400, "invalid_session_id");
  if (typeof body.action !== "string") throw new HttpError(400, "invalid_action");
  if (body.text !== undefined && body.text !== null && typeof body.text !== "string") {
    throw new HttpError(400, "invalid_text");
  }
  const text = typeof body.text === "string" ? body.text : null;
  const result = await asMember(db(), claims, async (tx) => {
    const rows = await tx`select api.interview_confirm_summary(${body.session_id as string}, ${body
      .action as string}, ${text}) as r`;
    return rows[0].r;
  });
  return json(req, result);
});
