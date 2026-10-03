// VAPID (RFC 8292): der Server weist sich beim Push-Dienst mit einem ES256-JWT aus.
// Schlüssel als base64url: öffentlich = unkomprimierter P-256-Punkt (65 Byte), privat = Skalar d (32 Byte).
// Umgebung: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (z. B. "mailto:hallo@fermata.example").
import { b64uDecode, b64uEncode } from "./ece.ts";

const te = new TextEncoder();
const ES256 = { name: "ECDSA", namedCurve: "P-256" } as const;

export interface Vapid {
  publicKey: string;
  privateKey: CryptoKey;
  subject: string;
}

export async function importVapid(publicKey: string, privateKey: string, subject: string): Promise<Vapid> {
  const pub = b64uDecode(publicKey);
  const d = b64uDecode(privateKey);
  if (pub.length !== 65 || pub[0] !== 0x04) throw new Error("VAPID_PUBLIC_KEY: 65 Byte (unkomprimiert) erwartet");
  if (d.length !== 32) throw new Error("VAPID_PRIVATE_KEY: 32 Byte erwartet");
  if (!/^(mailto:|https:\/\/)/.test(subject)) throw new Error("VAPID_SUBJECT: mailto: oder https:// erwartet");
  const key = await crypto.subtle.importKey("jwk", {
    kty: "EC",
    crv: "P-256",
    d: b64uEncode(d),
    x: b64uEncode(pub.slice(1, 33)),
    y: b64uEncode(pub.slice(33, 65)),
    ext: false,
  }, ES256, false, ["sign"]);
  return { publicKey: b64uEncode(pub), privateKey: key, subject };
}

/** Neues Schlüsselpaar (für die Einrichtung, siehe generate-vapid-keys.ts). */
export async function generateVapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
  const pair = await crypto.subtle.generateKey(ES256, true, ["sign", "verify"]) as CryptoKeyPair;
  const pub = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  return { publicKey: b64uEncode(pub), privateKey: jwk.d! };
}

/** JWT für einen Push-Dienst (aud = Ursprung der Endpoint-Adresse). exp höchstens 24 h (RFC 8292). */
export async function vapidJwt(vapid: Vapid, audience: string, expiresAt: number): Promise<string> {
  const header = b64uEncode(te.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64uEncode(te.encode(JSON.stringify({ aud: audience, exp: expiresAt, sub: vapid.subject })));
  const input = `${header}.${claims}`;
  // WebCrypto liefert die Signatur als r||s (64 Byte) – genau das Format von JWS ES256.
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, vapid.privateKey, te.encode(input)));
  return `${input}.${b64uEncode(sig)}`;
}

/** Authorization-Kopfzeile: "vapid t=<JWT>, k=<öffentlicher Schlüssel>". */
export async function vapidAuthorization(vapid: Vapid, endpoint: string, nowSeconds = Math.floor(Date.now() / 1000)): Promise<string> {
  const audience = new URL(endpoint).origin;
  const jwt = await vapidJwt(vapid, audience, nowSeconds + 12 * 3600);
  return `vapid t=${jwt}, k=${vapid.publicKey}`;
}
