// POST /functions/v1/notify-dispatch – verschickt fällige Nachrichten aus ops.notification_queue.
// Aufruf: pg_cron über pg_net (ops.notify_kick, jede Minute) oder ein externer Zeitplaner.
// Schutz: Kopfzeile x-fermata-dispatch-secret = NOTIFY_DISPATCH_SECRET (gleicher Wert in Vault:
// fermata_notify_dispatch_secret). Antwort: Zähler ohne Inhalte.
import { db } from "../_shared/db.ts";
import { timingSafeEqual } from "../_shared/crypto.ts";
import { appUrl, optionalEnv } from "../_shared/env.ts";
import { handler, HttpError, json } from "../_shared/http.ts";
import { sendMail } from "../_shared/mail/mod.ts";
import { dispatchDue, type DispatchDeps } from "../_shared/notify/dispatch.ts";
import { PgNotifyStore } from "../_shared/notify/store.ts";
import { pushSenderFromEnv } from "../_shared/push/send.ts";

export async function defaultDeps(): Promise<DispatchDeps> {
  const supabaseUrl = optionalEnv("SUPABASE_URL");
  return {
    store: new PgNotifyStore(db()),
    sendMail,
    push: await pushSenderFromEnv(),
    appUrl: appUrl(),
    functionsUrl: optionalEnv("FERMATA_FUNCTIONS_URL") ?? (supabaseUrl ? `${supabaseUrl.replace(/\/$/, "")}/functions/v1` : null),
    venueLinkSecret: optionalEnv("VENUE_LINK_SECRET") ?? null,
  };
}

let depsFactory: () => Promise<DispatchDeps> = defaultDeps;

/** Nur für Tests. */
export function setDispatchDeps(factory?: () => Promise<DispatchDeps>): void {
  depsFactory = factory ?? defaultDeps;
}

export default handler(["POST"], async (req) => {
  const secret = optionalEnv("NOTIFY_DISPATCH_SECRET");
  const given = req.headers.get("x-fermata-dispatch-secret") ?? "";
  if (!secret || !timingSafeEqual(given, secret)) throw new HttpError(401, "unauthorized");
  const stats = await dispatchDue(await depsFactory());
  return json(req, stats);
});
