// GET /functions/v1/push-key – öffentlicher VAPID-Schlüssel für die Web-App (pushManager.subscribe,
// applicationServerKey). Ohne Einrichtung: 503 push_not_configured.
import { optionalEnv } from "../_shared/env.ts";
import { handler, HttpError, json } from "../_shared/http.ts";

export default handler(["GET"], (req) => {
  const publicKey = optionalEnv("VAPID_PUBLIC_KEY");
  if (!publicKey) throw new HttpError(503, "push_not_configured");
  return Promise.resolve(json(req, { publicKey }, 200, { "cache-control": "public, max-age=3600" }));
});
