// POST /functions/v1/link-hit {"slug": "pfaffenteich"} – Plakat-Zähler (PLAN 2.3 Nr. 2).
// Aufrufer ist nur die Server-Funktion /s/[slug] der Landingpage, nie der Browser.
// Gespeichert wird nur Kürzel + Tag + Anzahl: keine IP, kein Cookie.
// Ist LINK_HIT_SECRET gesetzt, muss der Header x-fermata-link-secret passen.
import { z } from "zod";
import { timingSafeEqual } from "../_shared/crypto.ts";
import { db } from "../_shared/db.ts";
import { optionalEnv } from "../_shared/env.ts";
import { handler, HttpError, json, readJson } from "../_shared/http.ts";

const Body = z.object({ slug: z.string().max(100) });

export default handler(["POST"], async (req) => {
  const secret = optionalEnv("LINK_HIT_SECRET");
  if (secret && !timingSafeEqual(req.headers.get("x-fermata-link-secret") ?? "", secret)) {
    throw new HttpError(401, "unauthorized");
  }
  const parsed = Body.safeParse(await readJson(req, 1024));
  if (!parsed.success) throw new HttpError(400, "invalid_body");
  const [row] = await db()`select api.link_hit(${parsed.data.slug}) as counted`;
  return json(req, { counted: !!row?.counted });
});
