// Aufruf der Edge Functions aus dem Browser. Einzige Verbindung nach außen (CSP connect-src).
// forceFunctionRegion lässt Supabase die Function in Frankfurt ausführen (PLAN 2.1); lokal wird es ignoriert.
const BASE = (import.meta.env.PUBLIC_FUNCTIONS_URL || "http://localhost:54331/functions/v1").replace(/\/$/, "");
const REGION = import.meta.env.PUBLIC_FUNCTIONS_REGION || "eu-central-1";

export function functionUrl(name: string): string {
  return `${BASE}/${name}${REGION === "none" ? "" : `?forceFunctionRegion=${encodeURIComponent(REGION)}`}`;
}

/** Vorschau-Build (PUBLIC_PREVIEW=1) zum Ansehen ohne Server: nichts wird gesendet. In echten Builds immer false. */
export const PREVIEW = import.meta.env.PUBLIC_PREVIEW === "1";
const PREVIEW_TOKEN = "VorschauVorschauVorschauVorschauVorschau123";

function previewResponse(name: string): Response {
  if (name === "waitlist-signup") return new Response(null, { status: 202 });
  if (name === "waitlist-status") {
    return Response.json({
      first_name: "Maria",
      region_group: "westmecklenburg",
      place: 37,
      is_founding_member: true,
      bonus_steps: 0,
      invites: [{ code: "VORSCHAU", used: false }],
    });
  }
  return Response.json({ ok: true });
}

/** Seitenadresse; in der Vorschau liegen die Seiten als einzelne .html-Dateien nebeneinander. */
export function pageUrl(path: string): string {
  if (!PREVIEW) return path;
  const [page = "", hash] = path.split("#");
  const file = page === "/" ? "index.html" : `${page.replace(/^\//, "")}.html`;
  return hash ? `${file}#${hash}` : file;
}

export function callFunction(name: string, body: unknown): Promise<Response> {
  if (PREVIEW) return Promise.resolve(previewResponse(name));
  return fetch(functionUrl(name), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    credentials: "omit",
    cache: "no-store",
    referrerPolicy: "no-referrer",
  });
}

/** Persönliche Tokens stehen nur im Fragment (#t=…), nie in der Adresse, die an Server geht. */
export function fragmentParam(key: string): string | null {
  const value = new URLSearchParams(location.hash.slice(1)).get(key);
  if (PREVIEW && !value) return PREVIEW_TOKEN;
  return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
}
