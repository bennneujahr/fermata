// /s/<kürzel> – Plakat-Link (PLAN 2.3 Nr. 2): zählt einen Aufruf je Kürzel und Tag und leitet auf /?q=<kürzel> weiter.
// Die einzige Server-Funktion der Landingpage (Vercel, fra1). Keine IP, kein Cookie, keine Weitergabe von Kopfzeilen.
import type { APIRoute } from "astro";

export const prerender = false;

const SLUG_RE = /^[a-z0-9-]{1,40}$/;

export const GET: APIRoute = async ({ params }) => {
  const slug = (params.slug ?? "").toLowerCase();
  if (!SLUG_RE.test(slug)) return redirect("/");

  const base = (process.env.FUNCTIONS_URL || import.meta.env.PUBLIC_FUNCTIONS_URL || "http://localhost:54331/functions/v1").replace(/\/$/, "");
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (process.env.LINK_HIT_SECRET) headers["x-fermata-link-secret"] = process.env.LINK_HIT_SECRET;
  try {
    // Nur Kürzel; kurze Wartezeit, damit die Weiterleitung nie hängt.
    await fetch(`${base}/link-hit?forceFunctionRegion=eu-central-1`, {
      method: "POST",
      headers,
      body: JSON.stringify({ slug }),
      signal: AbortSignal.timeout(1500),
    });
  } catch {
    // Zählen ist nicht wichtiger als ankommen.
  }
  return redirect(`/?q=${encodeURIComponent(slug)}`);
};

function redirect(location: string): Response {
  return new Response(null, {
    status: 302,
    headers: { location, "cache-control": "no-store", "referrer-policy": "no-referrer" },
  });
}
