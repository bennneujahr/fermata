// /functions/v1/venue-confirm – Bestätigungslink aus der Reservierungs-Mail an das Lokal.
//
// Vertrag 3 (Härtung): Die Mail verlinkt auf die Web-App (<App>/lokal/bestaetigen#t=<token>). Die Seite liest den
// Schlüssel aus dem URL-Fragment und spricht diese Function mit Accept: application/json an:
//   GET  ?t=<token>                         → 200 {reservation…} (Datum, Uhrzeit, Tisch-Code, Stand) oder Fehler
//   POST ?t=<token> oder Body {"t":"…"}      → bestätigt die Reservierung, 200 {reservation…, confirmed: true}
//   Fehler: 400 {error:"invalid_link"}, 404 {error:"not_found"}, 503 {error:"not_configured"}, 500 {error:"internal"}
// Ohne Accept: application/json bleiben die bisherigen HTML-Seiten (GET zeigt die Reservierung mit einem Knopf; erst
// POST bestätigt, weil Mail-Programme Links oft automatisch aufrufen). Token: signiert mit VENUE_LINK_SECRET, gültig
// bis einen Tag nach dem Abend. Kein Personenbezug: das Lokal sieht nie Namen der Mitglieder.
import { db } from "../_shared/db.ts";
import { optionalEnv } from "../_shared/env.ts";
import { corsHeaders } from "../_shared/http.ts";
import {
  venueConfirmedPage,
  venueConfirmPage,
  venueLinkInvalidPage,
  type VenueSummary,
} from "../_shared/mail/templates/evening-venue.ts";
import { verifyVenueToken } from "../_shared/notify/venue-token.ts";

export interface VenueStore {
  summary(reservationId: string): Promise<VenueSummary | null>;
  confirm(reservationId: string): Promise<VenueSummary | null>;
}

const pgStore: VenueStore = {
  async summary(id) {
    const [row] = await db()`select ops.venue_reservation_summary(${id}) as s`;
    return (row?.s ?? null) as VenueSummary | null;
  },
  async confirm(id) {
    const [row] = await db()`select ops.venue_confirm_reservation(${id}) as s`;
    return (row?.s ?? null) as VenueSummary | null;
  },
};

let store: VenueStore = pgStore;

/** Nur für Tests. */
export function setVenueStore(s?: VenueStore): void {
  store = s ?? pgStore;
}

function page(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'",
    },
  });
}

function jsonResponse(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      "x-robots-tag": "noindex, nofollow",
      ...corsHeaders(req),
    },
  });
}

/** Nur die Angaben, die das Lokal braucht (keine internen Kennungen). */
function publicSummary(s: VenueSummary): Record<string, unknown> {
  return {
    venue_name: s.venue_name,
    starts_at: s.starts_at,
    table_code: s.table_code,
    reservation_name: s.reservation_name,
    persons: s.persons,
    status: s.status,
    venue_confirmed_at: s.venue_confirmed_at,
    confirmed: Boolean(s.venue_confirmed_at),
    cancelled: s.status !== "reserved",
  };
}

async function readToken(req: Request, wantsJson: boolean): Promise<string | null> {
  let token = new URL(req.url).searchParams.get("t") ?? "";
  if (req.method === "POST") {
    const text = await req.text();
    if (text.length > 2048) return null;
    const type = req.headers.get("content-type") ?? "";
    if (type.includes("application/json") || (wantsJson && text.trim().startsWith("{"))) {
      try {
        const body = JSON.parse(text) as { t?: unknown };
        if (typeof body?.t === "string" && body.t) token = body.t;
      } catch {
        // kaputter Body: Schlüssel aus der Adresse nehmen
      }
    } else {
      token = new URLSearchParams(text).get("t") ?? token;
    }
  }
  return token;
}

export default async function venueConfirm(req: Request): Promise<Response> {
  const wantsJson = (req.headers.get("accept") ?? "").includes("application/json");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== "GET" && req.method !== "POST") {
    return wantsJson
      ? jsonResponse(req, { error: "method_not_allowed" }, 405)
      : new Response(null, { status: 405, headers: { allow: "GET, POST" } });
  }
  try {
    const secret = optionalEnv("VENUE_LINK_SECRET");
    if (!secret) return wantsJson ? jsonResponse(req, { error: "not_configured" }, 503) : page(venueLinkInvalidPage(), 503);
    const token = await readToken(req, wantsJson);
    if (token === null) return wantsJson ? jsonResponse(req, { error: "payload_too_large" }, 413) : page(venueLinkInvalidPage(), 413);
    const id = await verifyVenueToken(secret, token);
    if (!id) return wantsJson ? jsonResponse(req, { error: "invalid_link" }, 400) : page(venueLinkInvalidPage(), 400);
    if (req.method === "GET") {
      const s = await store.summary(id);
      if (wantsJson) return s ? jsonResponse(req, publicSummary(s)) : jsonResponse(req, { error: "not_found" }, 404);
      return s ? page(venueConfirmPage(s, token)) : page(venueLinkInvalidPage(), 404);
    }
    const s = await store.confirm(id);
    if (wantsJson) return s ? jsonResponse(req, publicSummary(s)) : jsonResponse(req, { error: "not_found" }, 404);
    return s ? page(venueConfirmedPage(s)) : page(venueLinkInvalidPage(), 404);
  } catch (err) {
    console.error(JSON.stringify({ level: "error", msg: "venue-confirm", err: String(err) }));
    return wantsJson ? jsonResponse(req, { error: "internal" }, 500) : page(venueLinkInvalidPage(), 500);
  }
}
