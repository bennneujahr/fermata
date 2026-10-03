// Prüfung der Webhook-Signatur von Didit. EINZIGE Stelle dafür.
//
// Umgesetzt nach Didit-Doku (Stand 10/2026, aus dem Gedächtnis – PLATZHALTER „vor Start mit Didit-Sandbox prüfen“):
//   X-Signature: HMAC-SHA256 (hex) über den rohen Request-Body mit dem Webhook-Geheimnis
//   X-Timestamp: Unix-Sekunden; älter oder neuer als 5 Minuten wird abgelehnt (Schutz gegen Wiederholung)
// Falls Didit inzwischen X-Signature-V2 (sortiertes JSON) oder X-Signature-Simple verlangt, wird nur diese Datei angepasst.
import { hmacSha256Hex, timingSafeEqual } from "../crypto.ts";

export const SIGNATURE_HEADER = "x-signature";
export const TIMESTAMP_HEADER = "x-timestamp";
export const TOLERANCE_SECONDS = 300;

export type SignatureCheck = { ok: true } | { ok: false; reason: "missing" | "stale" | "mismatch" };

export async function verifyDiditSignature(
  rawBody: string,
  headers: Headers,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<SignatureCheck> {
  const sig = headers.get(SIGNATURE_HEADER)?.trim().toLowerCase();
  const ts = headers.get(TIMESTAMP_HEADER)?.trim();
  if (!sig || !ts || !secret) return { ok: false, reason: "missing" };
  const t = Number(ts);
  if (!Number.isFinite(t) || Math.abs(nowSeconds - t) > TOLERANCE_SECONDS) return { ok: false, reason: "stale" };
  const expected = await hmacSha256Hex(secret, rawBody);
  return timingSafeEqual(expected, sig) ? { ok: true } : { ok: false, reason: "mismatch" };
}

/** Signiert einen Body wie Didit (für den Fake-Modus und Tests). */
export async function signDiditBody(
  rawBody: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<Record<string, string>> {
  return {
    "content-type": "application/json",
    [SIGNATURE_HEADER]: await hmacSha256Hex(secret, rawBody),
    [TIMESTAMP_HEADER]: String(nowSeconds),
  };
}
