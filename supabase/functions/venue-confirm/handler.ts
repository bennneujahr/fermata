// /functions/v1/venue-confirm?t=<token> – Bestätigungslink aus der Reservierungs-Mail an das Lokal.
// GET zeigt die Reservierung mit einem Knopf; erst POST bestätigt (Mail-Programme rufen Links oft
// automatisch auf). Token: signiert mit VENUE_LINK_SECRET, gültig bis einen Tag nach dem Abend.
import { db } from "../_shared/db.ts";
import { optionalEnv } from "../_shared/env.ts";
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

export default async function venueConfirm(req: Request): Promise<Response> {
  if (req.method !== "GET" && req.method !== "POST") {
    return new Response(null, { status: 405, headers: { allow: "GET, POST" } });
  }
  try {
    const secret = optionalEnv("VENUE_LINK_SECRET");
    if (!secret) return page(venueLinkInvalidPage(), 503);
    let token = new URL(req.url).searchParams.get("t") ?? "";
    if (req.method === "POST") {
      const text = await req.text();
      if (text.length > 2048) return page(venueLinkInvalidPage(), 413);
      token = new URLSearchParams(text).get("t") ?? token;
    }
    const id = await verifyVenueToken(secret, token);
    if (!id) return page(venueLinkInvalidPage(), 400);
    if (req.method === "GET") {
      const s = await store.summary(id);
      return s ? page(venueConfirmPage(s, token)) : page(venueLinkInvalidPage(), 404);
    }
    const s = await store.confirm(id);
    return s ? page(venueConfirmedPage(s)) : page(venueLinkInvalidPage(), 404);
  } catch (err) {
    console.error(JSON.stringify({ level: "error", msg: "venue-confirm", err: String(err) }));
    return page(venueLinkInvalidPage(), 500);
  }
}
