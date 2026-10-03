// Aufrufe öffentlicher Edge Functions vom Server aus, ohne Anmeldung (nur mit dem öffentlichen Schlüssel):
// Kündigen/Widerrufen ohne Anmeldung, „Abend teilen“ (trust-view), Bestätigung durch das Lokal (venue-confirm).
// Der Schlüssel aus dem Link (#t=…) geht nur im Körper einer Server Action an unseren Server und von dort
// an die Function – er landet so nicht in Adresszeilen oder Protokollen der Web-App.
import "server-only";
import { functionsUrl, supabaseAnonKey } from "@/lib/env";

export interface PublicResult<T> {
  ok: boolean;
  status: number;
  /** JSON-Antwort (null, wenn die Function kein JSON liefert). */
  data: T | null;
  /** Fehlercode der Function ({ error }) oder http_<status>/network. */
  error: string | null;
  /** Deutscher Text der Function zum Fehler (falls vorhanden). */
  message?: string;
  /** true, wenn die Antwort JSON war. */
  json: boolean;
}

export async function callPublicFunction<T = unknown>(
  name: string,
  init: { method?: "GET" | "POST"; query?: Record<string, string>; body?: unknown; form?: Record<string, string> } = {},
): Promise<PublicResult<T>> {
  const url = new URL(`${functionsUrl()}/${name}`);
  for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, v);
  const headers: Record<string, string> = {
    apikey: supabaseAnonKey(),
    authorization: `Bearer ${supabaseAnonKey()}`,
    accept: "application/json",
    "x-region": "eu-central-1",
  };
  let body: string | undefined;
  if (init.form) {
    headers["content-type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams(init.form).toString();
  } else if (init.body !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(init.body);
  }
  let res: Response;
  try {
    res = await fetch(url, { method: init.method ?? (body ? "POST" : "GET"), headers, body, cache: "no-store", redirect: "manual" });
  } catch {
    return { ok: false, status: 503, data: null, error: "network", json: false };
  }
  const isJson = (res.headers.get("content-type") ?? "").includes("application/json");
  const parsed: unknown = isJson ? await res.json().catch(() => null) : (await res.text().catch(() => ""), null);
  const err = parsed as { error?: string; message?: string } | null;
  const error = res.ok ? null : (err?.error ?? `http_${res.status}`);
  return { ok: res.ok, status: res.status, data: res.ok && isJson ? (parsed as T) : null, error, message: err?.message, json: isJson };
}
