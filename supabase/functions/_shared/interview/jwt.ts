// JWT (HS256 signieren und prüfen, ES256/RS256 prüfen) mit WebCrypto – ohne Fremdbibliothek.
// Verwendet für: Supabase-Zugangstoken der Mitglieder, LiveKit-Zugang, Zugang zum Textmodus von Viola.
import { decodeBase64Url, encodeBase64Url } from "@std/encoding";

export type JwtPayload = Record<string, unknown> & { exp?: number; nbf?: number; iat?: number; sub?: string };
export type JwtHeader = { alg: string; typ?: string; kid?: string };

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64json(value: unknown): string {
  return encodeBase64Url(enc.encode(JSON.stringify(value)));
}

async function hmacKey(secret: string, usage: "sign" | "verify"): Promise<CryptoKey> {
  return await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [usage]);
}

/** Signiert einen JWT mit HS256. */
export async function signHs256(payload: JwtPayload, secret: string, header: Partial<JwtHeader> = {}): Promise<string> {
  if (!secret || secret.length < 32) throw new Error("JWT-Geheimnis fehlt oder ist zu kurz (mindestens 32 Zeichen)");
  const head = b64json({ alg: "HS256", typ: "JWT", ...header });
  const body = b64json(payload);
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret, "sign"), enc.encode(`${head}.${body}`));
  return `${head}.${body}.${encodeBase64Url(new Uint8Array(sig))}`;
}

export type DecodedJwt = {
  header: JwtHeader;
  payload: JwtPayload;
  signingInput: Uint8Array<ArrayBuffer>;
  signature: Uint8Array<ArrayBuffer>;
};

/** Zerlegt einen JWT ohne Prüfung der Signatur. */
export function decodeJwt(token: string): DecodedJwt {
  const parts = token.split(".");
  if (parts.length !== 3) throw new JwtError("malformed");
  try {
    const header = JSON.parse(dec.decode(decodeBase64Url(parts[0]!))) as JwtHeader;
    const payload = JSON.parse(dec.decode(decodeBase64Url(parts[1]!))) as JwtPayload;
    return {
      header,
      payload,
      signingInput: new Uint8Array(enc.encode(`${parts[0]}.${parts[1]}`)),
      signature: new Uint8Array(decodeBase64Url(parts[2]!)),
    };
  } catch {
    throw new JwtError("malformed");
  }
}

export class JwtError extends Error {
  constructor(public reason: "malformed" | "signature" | "expired" | "not_yet_valid" | "algorithm" | "claims") {
    super(`JWT ungültig: ${reason}`);
  }
}

function checkTimes(payload: JwtPayload, leewaySeconds: number, now = Math.floor(Date.now() / 1000)): void {
  if (typeof payload.exp !== "number") throw new JwtError("claims");
  if (payload.exp + leewaySeconds < now) throw new JwtError("expired");
  if (typeof payload.nbf === "number" && payload.nbf - leewaySeconds > now) throw new JwtError("not_yet_valid");
}

/** Prüft einen HS256-JWT (Signatur, exp, nbf) und liefert die Nutzdaten. */
export async function verifyHs256(token: string, secret: string, leewaySeconds = 30): Promise<JwtPayload> {
  const d = decodeJwt(token);
  if (d.header.alg !== "HS256") throw new JwtError("algorithm");
  const ok = await crypto.subtle.verify("HMAC", await hmacKey(secret, "verify"), d.signature, d.signingInput);
  if (!ok) throw new JwtError("signature");
  checkTimes(d.payload, leewaySeconds);
  return d.payload;
}

type Jwk = JsonWebKey & { kid?: string; alg?: string };
const jwksCache = new Map<string, { at: number; keys: Jwk[] }>();

/** Prüft einen asymmetrisch signierten JWT (ES256 oder RS256) gegen einen JWKS-Endpunkt. */
export async function verifyWithJwks(
  token: string,
  jwksUrl: string,
  leewaySeconds = 30,
  fetcher: typeof fetch = fetch,
): Promise<JwtPayload> {
  const d = decodeJwt(token);
  if (d.header.alg !== "ES256" && d.header.alg !== "RS256") throw new JwtError("algorithm");
  let cached = jwksCache.get(jwksUrl);
  if (!cached || Date.now() - cached.at > 10 * 60_000 || !cached.keys.some((k) => k.kid === d.header.kid)) {
    const res = await fetcher(jwksUrl, { headers: { accept: "application/json" } });
    if (!res.ok) throw new JwtError("signature");
    const body = (await res.json()) as { keys?: Jwk[] };
    cached = { at: Date.now(), keys: body.keys ?? [] };
    jwksCache.set(jwksUrl, cached);
  }
  const jwk = cached.keys.find((k) => k.kid === d.header.kid) ??
    (cached.keys.length === 1 ? cached.keys[0] : undefined);
  if (!jwk) throw new JwtError("signature");
  const { kid: _kid, alg: _alg, key_ops: _ops, ...keyData } = jwk as Jwk & { key_ops?: string[] };
  let ok = false;
  if (d.header.alg === "ES256") {
    const key = await crypto.subtle.importKey("jwk", keyData, { name: "ECDSA", namedCurve: "P-256" }, false, [
      "verify",
    ]);
    ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, d.signature, d.signingInput);
  } else {
    const key = await crypto.subtle.importKey("jwk", keyData, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, [
      "verify",
    ]);
    ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, d.signature, d.signingInput);
  }
  if (!ok) throw new JwtError("signature");
  checkTimes(d.payload, leewaySeconds);
  return d.payload;
}
