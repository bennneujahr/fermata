// Signierter Bestätigungslink für Lokale: <reservation_id>.<ablauf_unix>.<hmac>
// HMAC-SHA256 mit VENUE_LINK_SECRET, base64url. Kein Personenbezug im Token.
import { decodeBase64Url, encodeBase64Url } from "@std/encoding";
import { timingSafeEqual } from "../crypto.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

async function sign(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return encodeBase64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message))));
}

export async function signVenueToken(secret: string, reservationId: string, expiresAt: Date): Promise<string> {
  if (!UUID.test(reservationId)) throw new Error("reservationId muss eine UUID sein");
  const payload = `${reservationId}.${Math.floor(expiresAt.getTime() / 1000)}`;
  return `${payload}.${await sign(secret, payload)}`;
}

/** Liefert die Reservierungs-ID oder null (falsch signiert, abgelaufen, kaputt). */
export async function verifyVenueToken(secret: string, token: string, now = Date.now()): Promise<string | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [id, exp, sig] = parts as [string, string, string];
  if (!UUID.test(id) || !/^[0-9]{1,12}$/.test(exp) || !/^[A-Za-z0-9_-]{43}$/.test(sig)) return null;
  try {
    decodeBase64Url(sig);
  } catch {
    return null;
  }
  const expected = await sign(secret, `${id}.${exp}`);
  if (!timingSafeEqual(expected, sig)) return null;
  if (Number(exp) * 1000 < now) return null;
  return id;
}
