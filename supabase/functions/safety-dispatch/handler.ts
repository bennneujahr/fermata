// Interne Function: verschickt ausstehende Sicherheits-Mails. Aufruf durch pg_cron/pg_net
// (billing.invoke_internal) oder von Hand, immer mit FERMATA_INTERNAL_SECRET.
import { db } from "../_shared/db.ts";
import { handler, json } from "../_shared/http.ts";
import { requireInternal } from "../_shared/stripe/support.ts";
import { dispatchSafetyMails } from "./dispatch.ts";

export default handler(["POST"], async (req) => {
  requireInternal(req);
  const result = await dispatchSafetyMails(db());
  return json(req, result);
});
