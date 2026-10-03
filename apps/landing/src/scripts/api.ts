// Aufruf der Edge Functions aus dem Browser. Einzige Verbindung nach außen (CSP connect-src).
// forceFunctionRegion lässt Supabase die Function in Frankfurt ausführen (PLAN 2.1); lokal wird es ignoriert.
const BASE = (import.meta.env.PUBLIC_FUNCTIONS_URL || "http://localhost:54331/functions/v1").replace(/\/$/, "");
const REGION = import.meta.env.PUBLIC_FUNCTIONS_REGION || "eu-central-1";

export function functionUrl(name: string): string {
  return `${BASE}/${name}${REGION === "none" ? "" : `?forceFunctionRegion=${encodeURIComponent(REGION)}`}`;
}

export function callFunction(name: string, body: unknown): Promise<Response> {
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
  return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
}
