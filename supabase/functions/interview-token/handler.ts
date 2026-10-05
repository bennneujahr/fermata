// interview-token: Ein angemeldetes Mitglied fragt ein Gespräch mit Viola an (PLAN 2.3 Nr. 4).
// Prüft (in api.interview_request): Konto, Sperre, Ausweis, Einwilligung „gespraech“, Gesprächsart je Stufe,
// Tageslimit. Antwort: Sitzung plus LiveKit-Zugang (Stimme) oder Zugang zum Textmodus.
import { db } from "../_shared/db.ts";
import { optionalEnv } from "../_shared/env.ts";
import { handler, HttpError, json, readJson } from "../_shared/http.ts";
import { authenticateMember, isUuid } from "../_shared/interview/auth.ts";
import { asMember } from "../_shared/interview/db.ts";
import { signHs256 } from "../_shared/interview/jwt.ts";
import { createLiveKitToken } from "../_shared/interview/livekit.ts";

type Body = {
  kind?: unknown;
  mode?: unknown;
  evening_id?: unknown;
  continues_session_id?: unknown;
  /** Wechsel „Text statt Stimme“: Zugang zum Textmodus für diese eigene, offene Sitzung (keine neue Sitzung). */
  session_id?: unknown;
};
type SessionInfo = {
  id: string;
  kind: string;
  mode: "voice" | "text";
  address_form: "sie" | "du";
  tier_depth: string;
  room_name: string;
  expires_at: string;
  max_minutes: number;
  ai_notice_version: string;
};

/** Hinweis vor dem Verbinden (zusätzlich zum gesprochenen KI-Hinweis, Art. 50 AI Act). */
export function aiNoticeText(addressForm: "sie" | "du", mode: "voice" | "text"): string {
  if (addressForm === "du") {
    return mode === "voice"
      ? "Du sprichst gleich mit Viola. Viola ist eine künstliche Intelligenz, kein Mensch. Deine Stimme wird nicht aufgezeichnet."
      : "Du schreibst gleich mit Viola. Viola ist eine künstliche Intelligenz, kein Mensch.";
  }
  return mode === "voice"
    ? "Sie sprechen gleich mit Viola. Viola ist eine künstliche Intelligenz, kein Mensch. Ihre Stimme wird nicht aufgezeichnet."
    : "Sie schreiben gleich mit Viola. Viola ist eine künstliche Intelligenz, kein Mensch.";
}

function optionalUuid(v: unknown, name: string): string | null {
  if (v === undefined || v === null || v === "") return null;
  if (!isUuid(v)) throw new HttpError(400, `invalid_${name}`);
  return v;
}

export default handler(["POST"], async (req) => {
  const claims = await authenticateMember(req);
  const body = await readJson<Body>(req);
  const kind = body.kind ?? "erstgespraech";
  const mode = body.mode ?? "voice";
  if (typeof kind !== "string" || typeof mode !== "string") throw new HttpError(400, "invalid_request");
  const eveningId = optionalUuid(body.evening_id, "evening_id");
  const continues = optionalUuid(body.continues_session_id, "continues_session_id");
  const switchSession = optionalUuid(body.session_id, "session_id");
  if (switchSession && mode !== "text") throw new HttpError(400, "switch_only_to_text");

  // Stimme nur, wenn LiveKit eingerichtet ist – sonst gleich sagen, dass Text geht.
  const lk = {
    url: optionalEnv("LIVEKIT_URL"),
    key: optionalEnv("LIVEKIT_API_KEY"),
    secret: optionalEnv("LIVEKIT_API_SECRET"),
  };
  if (mode === "voice" && (!lk.url || !lk.key || !lk.secret)) throw new HttpError(503, "voice_unavailable");
  const textSecret = optionalEnv("VIOLA_TEXT_TOKEN_SECRET");
  const textUrl = optionalEnv("VIOLA_TEXT_URL");
  if (mode === "text" && (!textSecret || !textUrl)) throw new HttpError(503, "text_unavailable");

  const session = await asMember(db(), claims, async (tx) => {
    const rows = switchSession
      ? await tx`select api.interview_text_access(${switchSession}) as s`
      : await tx`select api.interview_request(${kind}, ${mode}, ${eveningId}, ${continues}) as s`;
    return rows[0].s as SessionInfo;
  });

  const now = Math.floor(Date.now() / 1000);
  const ttlSeconds = (15 + session.max_minutes + 10) * 60;
  const result: Record<string, unknown> = {
    session,
    ai_notice: aiNoticeText(session.address_form, session.mode),
  };

  if (session.mode === "voice") {
    const token = await createLiveKitToken({
      apiKey: lk.key!,
      apiSecret: lk.secret!,
      room: session.room_name,
      identity: `person-${session.id}`,
      ttlSeconds,
      agentName: optionalEnv("LIVEKIT_AGENT_NAME") ?? "viola",
      agentMetadata: { session_id: session.id, kind: session.kind },
      now,
    });
    result.voice = { url: lk.url, token, room: session.room_name, identity: `person-${session.id}` };
  } else {
    const token = await signHs256(
      {
        iss: "fermata",
        aud: "viola-text",
        sub: claims.sub,
        sid: session.id,
        iat: now,
        nbf: now - 5,
        exp: now + ttlSeconds,
      },
      textSecret!,
    );
    result.text = {
      url: `${textUrl!.replace(/\/$/, "")}/v1/text/sessions/${session.id}`,
      token,
      expires_at: new Date((now + ttlSeconds) * 1000).toISOString(),
    };
  }
  return json(req, result);
});
