// Prüfung der Stripe-Signatur (Header Stripe-Signature: t=<Zeit>,v1=<HMAC>[,v1=…]) mit WebCrypto.
// Signiert wird "<t>.<Rohtext>" mit HMAC-SHA256 und dem Webhook-Geheimnis (whsec_…).
// Toleranz 5 Minuten gegen Wiederholungsangriffe; Vergleich in konstanter Zeit.
import { hmacSha256Hex, timingSafeEqual } from "../crypto.ts";

export const DEFAULT_TOLERANCE_SECONDS = 300;

export type SignatureResult =
  | { ok: true; timestamp: number }
  | { ok: false; reason: "missing_header" | "malformed_header" | "timestamp_out_of_tolerance" | "no_matching_signature" };

export function parseSignatureHeader(header: string): { timestamp: number | null; signatures: string[] } {
  let timestamp: number | null = null;
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key === "t" && /^\d+$/.test(value)) timestamp = Number(value);
    if (key === "v1" && /^[0-9a-f]{64}$/i.test(value)) signatures.push(value.toLowerCase());
  }
  return { timestamp, signatures };
}

export async function verifyStripeSignature(
  payload: string,
  header: string | null,
  secret: string,
  opts: { toleranceSeconds?: number; nowSeconds?: number } = {},
): Promise<SignatureResult> {
  if (!header) return { ok: false, reason: "missing_header" };
  const { timestamp, signatures } = parseSignatureHeader(header);
  if (timestamp === null || signatures.length === 0) return { ok: false, reason: "malformed_header" };
  const now = opts.nowSeconds ?? Math.floor(Date.now() / 1000);
  const tolerance = opts.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;
  const expected = await hmacSha256Hex(secret, `${timestamp}.${payload}`);
  // Erst alle Signaturen prüfen, dann die Zeit: so verrät die Antwortzeit nichts über die Reihenfolge.
  let match = false;
  for (const sig of signatures) {
    if (timingSafeEqual(sig, expected)) match = true;
  }
  if (!match) return { ok: false, reason: "no_matching_signature" };
  if (Math.abs(now - timestamp) > tolerance) return { ok: false, reason: "timestamp_out_of_tolerance" };
  return { ok: true, timestamp };
}

/** Erzeugt einen gültigen Header (für Tests und lokale Probeläufe). */
export async function signStripePayload(payload: string, secret: string, timestamp = Math.floor(Date.now() / 1000)): Promise<string> {
  return `t=${timestamp},v1=${await hmacSha256Hex(secret, `${timestamp}.${payload}`)}`;
}
