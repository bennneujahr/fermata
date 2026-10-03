// Verschlüsselung von Web-Push-Nachrichten nach RFC 8291 („Message Encryption for Web Push“)
// mit dem Inhaltsformat aes128gcm aus RFC 8188. Nur WebCrypto, keine Abhängigkeiten.
//
// Aufbau der Nachricht: salt (16) | rs (uint32, Big Endian) | idlen (1) | keyid = Server-Schlüssel (65) | Chiffrat
// Schlüsselableitung (RFC 8291, Abschnitt 3.4):
//   ecdh_secret = ECDH(as_private, ua_public)
//   IKM   = HKDF(salt = auth_secret, ikm = ecdh_secret, info = "WebPush: info" 0x00 ua_public as_public, L = 32)
//   CEK   = HKDF(salt, IKM, "Content-Encoding: aes128gcm" 0x00, 16)
//   NONCE = HKDF(salt, IKM, "Content-Encoding: nonce" 0x00, 12)
import { decodeBase64Url, encodeBase64Url } from "@std/encoding";

const te = new TextEncoder();
const P256 = { name: "ECDH", namedCurve: "P-256" } as const;

export function b64uDecode(s: string): Uint8Array {
  return decodeBase64Url(s.replace(/=+$/, ""));
}
export function b64uEncode(b: Uint8Array): string {
  return encodeBase64Url(b);
}

export function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey("raw", key as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, data as BufferSource));
}

/** HKDF (RFC 5869) mit SHA-256 für Längen bis 32 Byte (ein Block). */
export async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  if (length > 32) throw new Error("hkdf: höchstens 32 Byte");
  const prk = await hmac(salt, ikm);
  return (await hmac(prk, concat(info, new Uint8Array([1])))).slice(0, length);
}

async function deriveKeys(
  authSecret: Uint8Array,
  ecdhSecret: Uint8Array,
  uaPublic: Uint8Array,
  asPublic: Uint8Array,
  salt: Uint8Array,
): Promise<{ cek: Uint8Array; nonce: Uint8Array; ikm: Uint8Array }> {
  const keyInfo = concat(te.encode("WebPush: info\0"), uaPublic, asPublic);
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32);
  const cek = await hkdf(salt, ikm, te.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, te.encode("Content-Encoding: nonce\0"), 12);
  return { cek, nonce, ikm };
}

async function ecdh(privateKey: CryptoKey, publicRaw: Uint8Array): Promise<Uint8Array> {
  const pub = await crypto.subtle.importKey("raw", publicRaw as BufferSource, P256, false, []);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: pub }, privateKey, 256));
}

export interface EncryptOptions {
  /** Nur für Tests: fester Salt (16 Byte). */
  salt?: Uint8Array;
  /** Nur für Tests: fester Server-Schlüssel (ECDH P-256, exportierbar). */
  senderKeys?: CryptoKeyPair;
  /** Datensatzgröße (RFC 8188), Standard 4096. */
  recordSize?: number;
  /** Zusätzliche Füllbytes (verbergen die Länge). */
  padding?: number;
}

/** Verschlüsselt eine Nachricht für ein Push-Abo (p256dh = ua_public, auth = auth_secret). */
export async function encryptPushPayload(
  uaPublic: Uint8Array,
  authSecret: Uint8Array,
  plaintext: Uint8Array,
  opts: EncryptOptions = {},
): Promise<Uint8Array> {
  if (uaPublic.length !== 65 || uaPublic[0] !== 0x04) {
    throw new Error("p256dh: unkomprimierter P-256-Punkt (65 Byte) erwartet");
  }
  if (authSecret.length !== 16) throw new Error("auth: 16 Byte erwartet");
  const rs = opts.recordSize ?? 4096;
  const padding = opts.padding ?? 0;
  if (plaintext.length + 1 + padding + 16 > rs) throw new Error("Nachricht zu groß für einen Datensatz");
  const salt = opts.salt ?? crypto.getRandomValues(new Uint8Array(16));
  if (salt.length !== 16) throw new Error("salt: 16 Byte erwartet");
  const sender = opts.senderKeys ?? (await crypto.subtle.generateKey(P256, true, ["deriveBits"])) as CryptoKeyPair;
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", sender.publicKey));

  const secret = await ecdh(sender.privateKey, uaPublic);
  const { cek, nonce } = await deriveKeys(authSecret, secret, uaPublic, asPublic, salt);

  // Ein einziger (letzter) Datensatz: Klartext, Trennzeichen 0x02, optionale Nullen.
  const record = concat(plaintext, new Uint8Array([0x02]), new Uint8Array(padding));
  const key = await crypto.subtle.importKey("raw", cek as BufferSource, "AES-GCM", false, ["encrypt"]);
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce as BufferSource, tagLength: 128 },
      key,
      record as BufferSource,
    ),
  );

  const header = new Uint8Array(21);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, rs, false);
  header[20] = asPublic.length;
  return concat(header, asPublic, cipher);
}

/** Entschlüsselt (Seite des Browsers). Für Tests und zur Prüfung der Gegenrichtung. */
export async function decryptPushPayload(
  body: Uint8Array,
  ua: { publicKey: Uint8Array; privateKey: CryptoKey },
  authSecret: Uint8Array,
): Promise<Uint8Array> {
  if (body.length < 21) throw new Error("zu kurz");
  const salt = body.slice(0, 16);
  const rs = new DataView(body.buffer, body.byteOffset, body.byteLength).getUint32(16, false);
  const idlen = body[20]!;
  const asPublic = body.slice(21, 21 + idlen);
  const cipher = body.slice(21 + idlen);
  if (cipher.length > rs) throw new Error("mehrere Datensätze werden nicht unterstützt");
  const secret = await ecdh(ua.privateKey, asPublic);
  const { cek, nonce } = await deriveKeys(authSecret, secret, ua.publicKey, asPublic, salt);
  const key = await crypto.subtle.importKey("raw", cek as BufferSource, "AES-GCM", false, ["decrypt"]);
  const record = new Uint8Array(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: nonce as BufferSource, tagLength: 128 },
      key,
      cipher as BufferSource,
    ),
  );
  let end = record.length - 1;
  while (end >= 0 && record[end] === 0) end--;
  if (end < 0 || record[end] !== 0x02) throw new Error("Trennzeichen des letzten Datensatzes fehlt");
  return record.slice(0, end);
}

/** ECDH-Schlüssel (P-256) aus Rohdaten: privat 32 Byte, öffentlich 65 Byte. */
export async function importEcdhKeyPair(privateRaw: Uint8Array, publicRaw: Uint8Array): Promise<CryptoKeyPair> {
  const jwk: JsonWebKey = {
    kty: "EC",
    crv: "P-256",
    d: b64uEncode(privateRaw),
    x: b64uEncode(publicRaw.slice(1, 33)),
    y: b64uEncode(publicRaw.slice(33, 65)),
    ext: true,
  };
  const privateKey = await crypto.subtle.importKey("jwk", jwk, P256, true, ["deriveBits"]);
  const publicKey = await crypto.subtle.importKey("raw", publicRaw as BufferSource, P256, true, []);
  return { privateKey, publicKey };
}
