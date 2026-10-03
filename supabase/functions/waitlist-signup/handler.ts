// POST /functions/v1/waitlist-signup – Anmeldung zur Warteliste (PLAN 2.3 Nr. 1).
// Ablauf: Form prüfen → Honigtopf → Mindestzeit → api.waitlist_signup (Drossel, Regeln) → Mail.
// Die Antwort ist für neue, unbestätigte und bestätigte Adressen gleich (202 {"ok": true}).
import { z } from "zod";
import { db } from "../_shared/db.ts";
import { functionsUrl, optionalEnv, siteUrl } from "../_shared/env.ts";
import { clientIp, handler, HttpError, json, readJson } from "../_shared/http.ts";
import { sendMail } from "../_shared/mail/mod.ts";
import { waitlistAlreadyMail, waitlistConfirmMail } from "../_shared/mail/templates/waitlist.ts";
import { issueToken, REGIONS, setting } from "../_shared/waitlist.ts";

const NAME_RE = /^\p{L}[\p{L} .'’-]{0,59}$/u;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const POSTAL_RE = /^[0-9]{5}$/;

const Body = z.object({
  first_name: z.string().max(200).default(""),
  email: z.string().max(400).default(""),
  region: z.string().max(60).default(""),
  postal_code: z.string().max(20).default(""),
  consent: z.boolean().default(false),
  consent_version: z.string().max(100).default(""),
  source: z.string().max(100).nullish(),
  invite: z.string().max(40).nullish(),
  /** Honigtopf: für Menschen unsichtbar, muss leer bleiben. */
  website: z.string().max(1000).nullish(),
  /** Millisekunden zwischen Laden der Seite und Absenden (im Browser gemessen, keine Uhrzeit). */
  fill_ms: z.number().int().nonnegative().nullish(),
});

export type FieldError = "required" | "invalid";

export function validate(b: z.infer<typeof Body>): Record<string, FieldError> {
  const fields: Record<string, FieldError> = {};
  const name = b.first_name.trim().replace(/\s+/g, " ");
  const email = b.email.trim();
  const postal = b.postal_code.trim();
  if (!name) fields.first_name = "required";
  else if (!NAME_RE.test(name)) fields.first_name = "invalid";
  if (!email) fields.email = "required";
  else if (email.length > 254 || !EMAIL_RE.test(email)) fields.email = "invalid";
  if (!b.region) fields.region = "required";
  else if (!(REGIONS as readonly string[]).includes(b.region)) fields.region = "invalid";
  if (!postal) fields.postal_code = "required";
  else if (!POSTAL_RE.test(postal)) fields.postal_code = "invalid";
  if (!b.consent) fields.consent = "required";
  else if (!b.consent_version) fields.consent = "invalid";
  return fields;
}

const accepted = (req: Request) => json(req, { ok: true }, 202);

/** Supabase führt die Function dann in Frankfurt aus (Regional Invocation, PLAN 2.1). */
function regionParam(): string {
  const region = optionalEnv("FERMATA_FUNCTIONS_REGION") ?? "eu-central-1";
  return region === "none" ? "" : `&forceFunctionRegion=${encodeURIComponent(region)}`;
}

export default handler(["POST"], async (req) => {
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) throw new HttpError(400, "invalid_body");
  const b = parsed.data;

  // Honigtopf: Bots bekommen dieselbe Antwort wie Menschen, es passiert aber nichts.
  if (b.website && b.website.trim() !== "") return accepted(req);

  const minFillMs = (await setting<number>("waitlist.min_fill_seconds")) * 1000;
  if (b.fill_ms == null || b.fill_ms < minFillMs) {
    return json(req, { error: "too_fast" }, 400);
  }

  const fields = validate(b);
  if (Object.keys(fields).length) return json(req, { error: "validation", fields }, 422);

  const confirm = await issueToken();
  const status = await issueToken();
  const email = b.email.trim().toLowerCase();
  const [row] = await db()`
    select api.waitlist_signup(
      ${b.first_name}, ${email}, ${b.region}, ${b.postal_code}, ${b.consent_version},
      ${b.source ?? null}, ${b.invite ?? null}, ${clientIp(req)}, ${confirm.hash}, ${status.hash}
    ) as r`;
  const r = row!.r as {
    result: string;
    send?: "confirm" | "already" | null;
    first_name?: string;
    fields?: Record<string, FieldError>;
  };

  if (r.result === "throttled") return json(req, { error: "throttled" }, 429);
  if (r.result === "invalid") return json(req, { error: "validation", fields: r.fields ?? {} }, 422);
  if (!r.send) return accepted(req);

  try {
    if (r.send === "confirm") {
      const [validHours, retentionDays] = await Promise.all([
        setting<number>("waitlist.confirm_token_hours"),
        setting<number>("waitlist.unconfirmed_retention_days"),
      ]);
      const draft = waitlistConfirmMail({
        firstName: r.first_name ?? "",
        confirmUrl: `${functionsUrl()}/waitlist-confirm?t=${confirm.token}${regionParam()}`,
        validHours,
        retentionDays,
      });
      await sendMail({ ...draft, to: email });
    } else {
      const draft = waitlistAlreadyMail({
        firstName: r.first_name ?? "",
        statusUrl: `${siteUrl()}/willkommen#t=${status.token}`,
      });
      await sendMail({ ...draft, to: email });
    }
  } catch (err) {
    // Ohne Adresse protokollieren; die Pause zurücksetzen, damit ein neuer Versuch sofort eine Mail auslöst.
    console.error(
      JSON.stringify({ level: "error", msg: "waitlist mail failed", template: r.send, error: String(err) }),
    );
    await db()`select api.waitlist_mail_failed(${email})`;
    return json(req, { error: "mail_failed" }, 503);
  }
  return accepted(req);
});
