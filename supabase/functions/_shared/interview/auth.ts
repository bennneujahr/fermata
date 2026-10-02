// Anmeldung der Mitglieder in den Interview-Functions: Supabase-Zugangstoken prüfen.
// HS256 mit SUPABASE_JWT_SECRET (lokal, ältere Projekte) oder ES256/RS256 über den JWKS-Endpunkt
// des Projekts (neue Signierschlüssel). Ergebnis: geprüfte Claims für request.jwt.claims.
import { HttpError } from "../http.ts";
import { optionalEnv } from "../env.ts";
import { decodeJwt, JwtError, type JwtPayload, verifyHs256, verifyWithJwks } from "./jwt.ts";

export type MemberClaims = JwtPayload & { sub: string; role: string; aal?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID.test(v);
}

export function bearer(req: Request): string | undefined {
  const h = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m?.[1];
}

/** Prüft den Supabase-Zugangstoken und liefert die Claims. Wirft 401 ohne Details. */
export async function authenticateMember(req: Request, fetcher: typeof fetch = fetch): Promise<MemberClaims> {
  const token = bearer(req);
  if (!token) throw new HttpError(401, "not_authenticated");
  let payload: JwtPayload;
  try {
    const { header } = decodeJwt(token);
    const secret = optionalEnv("SUPABASE_JWT_SECRET");
    if (header.alg === "HS256") {
      if (!secret) throw new JwtError("algorithm");
      payload = await verifyHs256(token, secret);
    } else {
      const base = optionalEnv("SUPABASE_URL");
      if (!base) throw new JwtError("algorithm");
      payload = await verifyWithJwks(token, `${base.replace(/\/$/, "")}/auth/v1/.well-known/jwks.json`, 30, fetcher);
    }
  } catch (err) {
    if (err instanceof JwtError) throw new HttpError(401, "not_authenticated");
    throw err;
  }
  if (payload.role !== "authenticated" || !isUuid(payload.sub) || payload.is_anonymous === true) {
    throw new HttpError(401, "not_authenticated");
  }
  return payload as MemberClaims;
}
