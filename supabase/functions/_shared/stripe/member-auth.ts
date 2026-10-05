// Anmeldung der Mitglieder in Edge Functions: Supabase-JWT aus dem Authorization-Header prüfen.
// HS256 mit SUPABASE_JWT_SECRET (älteres Supabase-Verfahren, auch in Tests) oder asymmetrische Schlüssel
// (ES256/RS256) über die JWKS von Supabase Auth (SUPABASE_URL/auth/v1/.well-known/jwks.json).
// Hinweis: Sobald M2 einen gemeinsamen Auth-Helfer in _shared anlegt, kann dieser hier ersetzt werden.
import { decodeBase64Url } from "@std/encoding";
import { optionalEnv } from "../env.ts";
import { HttpError } from "../http.ts";

export interface MemberClaims {
  sub: string;
  role: string;
  aal?: string;
  email?: string;
  exp: number;
  [key: string]: unknown;
}

export interface Member {
  id: string;
  aal: string;
  email?: string;
  claims: MemberClaims;
}

type Jwk = JsonWebKey & { kid?: string; alg?: string };
let jwksCache: { at: number; keys: Jwk[] } | undefined;

function decodeJson(part: string): any {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(part)));
}

async function jwks(url: string, fetchFn: typeof fetch): Promise<Jwk[]> {
  if (jwksCache && Date.now() - jwksCache.at < 10 * 60_000) return jwksCache.keys;
  const res = await fetchFn(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`JWKS nicht erreichbar (${res.status})`);
  const body = (await res.json()) as { keys?: Jwk[] };
  jwksCache = { at: Date.now(), keys: body.keys ?? [] };
  return jwksCache.keys;
}

export async function verifyJwt(
  token: string,
  opts: { secret?: string; jwksUrl?: string; fetchFn?: typeof fetch; nowSeconds?: number } = {},
): Promise<MemberClaims> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("JWT hat kein gültiges Format");
  const [h, p, s] = parts as [string, string, string];
  const header = decodeJson(h) as { alg?: string; kid?: string };
  const data = new TextEncoder().encode(`${h}.${p}`);
  const signature = decodeBase64Url(s);
  let valid = false;
  if (header.alg === "HS256") {
    if (!opts.secret) throw new Error("Kein Geheimnis für HS256");
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(opts.secret), { name: "HMAC", hash: "SHA-256" }, false, [
      "verify",
    ]);
    valid = await crypto.subtle.verify("HMAC", key, signature, data);
  } else if (header.alg === "ES256" || header.alg === "RS256") {
    if (!opts.jwksUrl) throw new Error("Keine JWKS-Adresse");
    const keys = await jwks(opts.jwksUrl, opts.fetchFn ?? fetch);
    const jwk = keys.find((k) => k.kid === header.kid) ?? (keys.length === 1 ? keys[0] : undefined);
    if (!jwk) throw new Error("Schlüssel nicht gefunden");
    if (header.alg === "ES256") {
      const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
      valid = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, signature, data);
    } else {
      const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
      valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, signature, data);
    }
  } else {
    throw new Error(`Nicht unterstütztes Verfahren: ${header.alg}`);
  }
  if (!valid) throw new Error("Signatur ungültig");
  const claims = decodeJson(p) as MemberClaims;
  const now = opts.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== "number" || claims.exp < now - 30) throw new Error("JWT abgelaufen");
  return claims;
}

/** Angemeldete Person aus dem Request; sonst 401. */
export async function requireMember(req: Request): Promise<Member> {
  const auth = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  if (!m) throw new HttpError(401, "not_authenticated", "Bitte melden Sie sich an.");
  const supabaseUrl = optionalEnv("SUPABASE_URL");
  let claims: MemberClaims;
  try {
    claims = await verifyJwt(m[1]!.trim(), {
      secret: optionalEnv("SUPABASE_JWT_SECRET"),
      jwksUrl: supabaseUrl ? `${supabaseUrl.replace(/\/$/, "")}/auth/v1/.well-known/jwks.json` : undefined,
    });
  } catch {
    throw new HttpError(401, "not_authenticated", "Bitte melden Sie sich erneut an.");
  }
  if (claims.role !== "authenticated" || !claims.sub) {
    throw new HttpError(401, "not_authenticated", "Bitte melden Sie sich an.");
  }
  return { id: claims.sub, aal: claims.aal ?? "aal1", email: claims.email, claims };
}

/** Optional angemeldet (für Abläufe, die auch ohne Anmeldung gehen). Anon-Schlüssel oder ungültige Token: nicht angemeldet. */
export async function optionalMember(req: Request): Promise<Member | undefined> {
  if (!/^Bearer\s+\S+/i.test(req.headers.get("authorization") ?? "")) return undefined;
  try {
    return await requireMember(req);
  } catch {
    return undefined;
  }
}
