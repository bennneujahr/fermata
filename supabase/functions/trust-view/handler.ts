// Öffentliche Seite „Abend teilen“: Eine Vertrauensperson sieht Lokal, Adresse, Datum und Uhrzeit,
// den Vornamen des Mitglieds und das Heimwegtelefon. Nie Daten des Gegenübers.
//
// Vertrag 3 (Härtung): Der Link, den das Mitglied weitergibt, zeigt auf die Web-App (<App>/teilen#t=<Schlüssel>,
// Einstellung safety.trust_view_base_url). Die Seite liest den Schlüssel aus dem URL-Fragment und fragt hier an:
//   GET  /functions/v1/trust-view?t=<Schlüssel>        mit Accept: application/json → 200 {…} oder 404 {error:"not_found"}
//   POST /functions/v1/trust-view  Body {"t":"<Schlüssel>"} (Accept: application/json) → dasselbe
// Ohne Accept: application/json antwortet die Function wie bisher mit einer kleinen HTML-Seite (Rückfall für alte Links).
// Der Link läuft safety.trust_share_hours nach Beginn ab oder wenn das Mitglied ihn zurückzieht.
import { db } from "../_shared/db.ts";
import { handler, json, readJson } from "../_shared/http.ts";
import { formatDateTime } from "../_shared/mail/templates/billing-format.ts";
import { escapeHtml, htmlHeaders, page, PAGE_STYLE } from "../_shared/stripe/support.ts";

type View = {
  first_name: string | null;
  starts_at: string | null;
  expires_at: string;
  venue: { name: string; street: string; postal_code: string; city: string; public_transport?: string | null } | null;
  heimwegtelefon: { number: string; tel: string; hours: string };
  emergency_number: string;
};

export function renderTrustView(v: View): string {
  const name = v.first_name ? escapeHtml(v.first_name) : "Ein Mitglied";
  const venue = v.venue
    ? `<p><strong>${escapeHtml(v.venue.name)}</strong><br>${escapeHtml(v.venue.street)}<br>${escapeHtml(v.venue.postal_code)} ${escapeHtml(v.venue.city)}</p>` +
      (v.venue.public_transport ? `<p><small>Anfahrt: ${escapeHtml(v.venue.public_transport)}</small></p>` : "")
    : "<p>Das Lokal steht noch nicht fest.</p>";
  return page(
    "Abend geteilt",
    `<h1>${name} hat einen Abend mit Ihnen geteilt</h1>` +
      `<p>${name} trifft sich über Fermata mit einer Person zu einem Abend in einem öffentlichen Partner-Lokal und möchte, dass Sie Bescheid wissen.</p>` +
      `<div class="box"><p>Wann: <strong>${v.starts_at ? escapeHtml(formatDateTime(v.starts_at)) : "noch offen"}</strong></p>${venue}</div>` +
      `<div class="box"><p>Heimwegtelefon (${escapeHtml(v.heimwegtelefon.hours)}):<br>` +
      `<a class="tel" href="tel:${escapeHtml(v.heimwegtelefon.tel)}">${escapeHtml(v.heimwegtelefon.number)}</a></p>` +
      `<p>Bei akuter Gefahr: <a class="tel" href="tel:${escapeHtml(v.emergency_number)}">${escapeHtml(v.emergency_number)}</a></p></div>` +
      `<p><small>Dieser Link gilt bis ${escapeHtml(formatDateTime(v.expires_at))}. Er zeigt nur, was ${name} teilen möchte. ` +
      `Bitte geben Sie ihn nicht weiter.</small></p>`,
  );
}

export function renderInvalid(): string {
  return page(
    "Link nicht gültig",
    "<h1>Dieser Link ist nicht mehr gültig</h1><p>Der geteilte Abend ist vorbei, wurde abgesagt oder der Link wurde zurückgezogen.</p>" +
      "<p>Wenn Sie sich Sorgen machen, rufen Sie die Person direkt an. Bei akuter Gefahr wählen Sie 110.</p>",
  );
}

async function tokenFrom(req: Request): Promise<string> {
  const fromQuery = new URL(req.url).searchParams.get("t") ?? "";
  if (req.method !== "POST") return fromQuery;
  const body = await readJson<{ t?: unknown; token?: unknown }>(req, 2048).catch(() => ({} as { t?: unknown }));
  const t = typeof body?.t === "string" ? body.t : typeof (body as { token?: unknown })?.token === "string" ? String((body as { token?: unknown }).token) : "";
  return t || fromQuery;
}

export default handler(["GET", "POST"], async (req) => {
  const token = await tokenFrom(req);
  const wantsJson = (req.headers.get("accept") ?? "").includes("application/json");
  let view: View | null = null;
  if (/^[A-Za-z0-9_=-]{16,128}$/.test(token)) {
    const [row] = await db()`select safety.trust_share_view(${token}) as v`;
    view = (row?.v ?? null) as View | null;
  }
  if (wantsJson) {
    return view ? json(req, view, 200, { "x-robots-tag": "noindex" }) : json(req, { error: "not_found" }, 404, { "x-robots-tag": "noindex" });
  }
  const headers = await htmlHeaders(PAGE_STYLE);
  return new Response(view ? renderTrustView(view) : renderInvalid(), { status: view ? 200 : 404, headers });
});
