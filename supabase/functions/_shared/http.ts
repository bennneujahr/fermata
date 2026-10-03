// Antworten, CORS und Fehlerbehandlung für alle Edge Functions.
import { optionalEnv } from "./env.ts";

export class HttpError extends Error {
  constructor(public status: number, public code: string, message?: string) {
    super(message ?? code);
  }
}

function allowedOrigins(): string[] {
  return (optionalEnv("FERMATA_ALLOWED_ORIGINS") ?? "http://localhost:4321,http://localhost:3000")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin");
  const headers: Record<string, string> = {
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "authorization, content-type, x-client-info, apikey",
    "access-control-max-age": "600",
    vary: "Origin",
  };
  if (origin && allowedOrigins().includes(origin)) headers["access-control-allow-origin"] = origin;
  return headers;
}

export function json(req: Request, body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...corsHeaders(req),
      ...extra,
    },
  });
}

export function redirect(location: string, status = 303): Response {
  return new Response(null, { status, headers: { location, "cache-control": "no-store", "referrer-policy": "no-referrer" } });
}

/** Rahmen für jede Function: OPTIONS, erlaubte Methoden, einheitliche Fehler ohne interne Details. */
export function handler(
  methods: string[],
  fn: (req: Request) => Promise<Response>,
): (req: Request) => Promise<Response> {
  return async (req) => {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
    if (!methods.includes(req.method)) return json(req, { error: "method_not_allowed" }, 405);
    try {
      return await fn(req);
    } catch (err) {
      if (err instanceof HttpError) return json(req, { error: err.code, message: err.message }, err.status);
      console.error(JSON.stringify({ level: "error", msg: String(err), stack: (err as Error)?.stack }));
      return json(req, { error: "internal" }, 500);
    }
  };
}

export async function readJson<T = unknown>(req: Request, maxBytes = 16_384): Promise<T> {
  const text = await req.text();
  if (text.length > maxBytes) throw new HttpError(413, "payload_too_large");
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError(400, "invalid_json");
  }
}

/** Client-IP hinter dem Supabase-Proxy (nur für gehashte Drossel, nie gespeichert). */
export function clientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}
