// POST /functions/v1/verification-webhook – Ergebnis von Didit (PLAN 3.2 Nr. 6–7, 5.5).
// 1. Signatur prüfen (eine Stelle: _shared/didit/signature.ts).
// 2. Entscheidung holen, nur vergleichen/hashen (ops.verification_complete), nie speichern oder protokollieren.
// 3. Bei endgültigem Ergebnis die Sitzung bei Didit löschen („process and purge“) und das vermerken.
// Ohne JWT (Didit ruft auf). In supabase/config.toml bzw. beim Deploy: verify_jwt = false für diese Function.
import { db } from "../_shared/db.ts";
import { isPgError } from "../_shared/dberror.ts";
import { didit, diditWebhookSecret, mapStatus, verifyDiditSignature } from "../_shared/didit/mod.ts";
import type { DiditClient } from "../_shared/didit/mod.ts";
import type { Sql } from "../_shared/db.ts";
import { handler, HttpError, json } from "../_shared/http.ts";

const MAX_BODY = 512 * 1024;

async function purge(sql: Sql, client: DiditClient, sessionId: string): Promise<boolean> {
  try {
    await client.deleteSession(sessionId);
    await sql`select ops.verification_session_deleted(${sessionId})`;
    return true;
  } catch (err) {
    console.error(JSON.stringify({ level: "warn", msg: "didit_session_delete_failed", err: String(err) }));
    return false;
  }
}

export default handler(["POST"], async (req) => {
  const raw = await req.text();
  if (raw.length > MAX_BODY) throw new HttpError(413, "payload_too_large");
  const check = await verifyDiditSignature(raw, req.headers, diditWebhookSecret());
  if (!check.ok) throw new HttpError(401, `signature_${check.reason}`);

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new HttpError(400, "invalid_json");
  }
  const sessionId = typeof body.session_id === "string" ? body.session_id : "";
  if (!sessionId) throw new HttpError(400, "session_missing");

  const outcome = mapStatus(body.status);
  if (!outcome) return json(req, { ok: true, ignored: "not_final" });

  const sql = db();
  const client = didit();
  let first: string | null = null, last: string | null = null, birth: string | null = null, doc: string | null = null;
  if (outcome === "approved" || outcome === "declined") {
    const decision = await client.getDecision(sessionId, body);
    first = decision.firstName;
    last = decision.lastName;
    birth = decision.birthDate;
    doc = decision.documentNumber;
  }

  let result: { status: string; final: boolean };
  try {
    const [row] = await sql`
      select ops.verification_complete(${sessionId}, ${outcome}, ${first}, ${last}, ${birth}::date, ${doc}) as r`;
    result = row!.r as { status: string; final: boolean };
  } catch (err) {
    if (isPgError(err) && err.code === "P0002") {
      // Unbekannte Sitzung: quittieren, damit Didit nicht endlos wiederholt.
      return json(req, { ok: true, ignored: "unknown_session" });
    }
    throw err;
  } finally {
    first = last = birth = doc = null;
  }

  let deleted = false;
  if (result.final) deleted = await purge(sql, client, sessionId);

  // Nachholen: frühere Sitzungen, deren Löschung fehlgeschlagen ist.
  const pending = await sql`select provider_session_id from ops.verifications_pending_deletion(5) where provider = 'didit'`;
  for (const p of pending) {
    if (p.provider_session_id !== sessionId) await purge(sql, client, p.provider_session_id as string);
  }

  return json(req, { ok: true, status: result.status, session_deleted: deleted });
});
