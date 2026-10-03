// POST /functions/v1/verification-start – Ausweisprüfung beginnen (PLAN 2.3 Nr. 3, 5.5).
// Verlangt Anmeldung und die Einwilligung biometrie (prüft ops.verification_begin).
// Antwort: { url } – dorthin leitet die Web-App weiter (Didit oder lokal die Simulationsseite).
import { requireUser } from "../_shared/auth.ts";
import { db } from "../_shared/db.ts";
import { rethrowDbError } from "../_shared/dberror.ts";
import { didit } from "../_shared/didit/mod.ts";
import { appUrl } from "../_shared/env.ts";
import { handler, HttpError, json } from "../_shared/http.ts";

export default handler(["POST"], async (req) => {
  const user = await requireUser(req);
  const sql = db();
  const client = didit();

  let verificationId: string;
  try {
    const [row] = await sql`select ops.verification_begin(${user.id}::uuid, 'didit') as r`;
    verificationId = (row!.r as { verification_id: string }).verification_id;
  } catch (err) {
    rethrowDbError(err, { too_many_attempts: 429 });
  }

  let session;
  try {
    session = await client.createSession({
      vendorData: verificationId,
      callbackUrl: `${appUrl()}/onboarding/ausweis/zurueck`,
    });
  } catch (err) {
    // Anbieter nicht erreichbar: Versuch zählt nicht.
    await sql`delete from app.verifications where id = ${verificationId}::uuid and provider_session_id is null`;
    console.error(JSON.stringify({ level: "error", msg: "didit_session_create_failed", err: String(err) }));
    throw new HttpError(502, "provider_unavailable");
  }
  await sql`select ops.verification_attach_session(${verificationId}::uuid, ${session.sessionId})`;
  return json(req, { url: session.url, verification_id: verificationId, mode: client.mode });
});
