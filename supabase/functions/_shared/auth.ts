// Anmeldung in Edge Functions prüfen (Bearer-Token aus der Web-App).
// Das Token wird bei Supabase Auth (GET /auth/v1/user) geprüft; erst danach werden die Claims gelesen.
// So funktioniert es mit symmetrischen (HS256, lokal) und asymmetrischen Schlüsseln (gehostet) gleich.
import { decodeBase64Url } from "@std/encoding";
import type { Sql } from "./db.ts";
import { env } from "./env.ts";
import { HttpError } from "./http.ts";

export interface AuthUser {
  id: string;
  email: string | null;
  /** Stufe der Anmeldung: aal1 (E-Mail-Code) oder aal2 (zusätzlich TOTP). */
  aal: "aal1" | "aal2";
  claims: Record<string, unknown>;
  token: string;
}

let fetchFn: typeof fetch = (...args) => fetch(...args);

/** Nur für Tests: Aufrufe an Supabase Auth ersetzen. */
export function setAuthFetch(fn: typeof fetch | undefined): void {
  fetchFn = fn ?? ((...args) => fetch(...args));
}

export function authFetch(): typeof fetch {
  return fetchFn;
}

export function supabaseUrl(): string {
  return env("SUPABASE_URL").replace(/\/$/, "");
}

export function decodeJwtPayload(token: string): Record<string, unknown> {
  const part = token.split(".")[1];
  if (!part) throw new HttpError(401, "invalid_token");
  try {
    return JSON.parse(new TextDecoder().decode(decodeBase64Url(part)));
  } catch {
    throw new HttpError(401, "invalid_token");
  }
}

export function bearer(req: Request): string {
  const h = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  if (!m) throw new HttpError(401, "unauthorized");
  return m[1]!.trim();
}

/** Prüft das Token bei Supabase Auth und liefert Person und Claims. */
export async function requireUser(req: Request): Promise<AuthUser> {
  const token = bearer(req);
  const res = await fetchFn(`${supabaseUrl()}/auth/v1/user`, {
    headers: { authorization: `Bearer ${token}`, apikey: env("SUPABASE_ANON_KEY") },
  });
  if (res.status === 401 || res.status === 403) throw new HttpError(401, "unauthorized");
  if (!res.ok) throw new HttpError(502, "auth_unavailable");
  const user = (await res.json()) as { id?: string; email?: string };
  const claims = decodeJwtPayload(token);
  if (!user.id || claims.sub !== user.id) throw new HttpError(401, "unauthorized");
  return { id: user.id, email: user.email ?? null, aal: claims.aal === "aal2" ? "aal2" : "aal1", claims, token };
}

/**
 * Führt fn in einer Transaktion als diese Person aus (Rolle authenticated, Claims wie bei PostgREST).
 * So gelten in Edge Functions dieselben Regeln (RLS, auth.uid(), app.is_admin()) wie in der Web-App.
 */
export async function asUser<T>(sql: Sql, user: AuthUser, fn: (tx: Sql) => Promise<T>): Promise<T> {
  return (await sql.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${
      JSON.stringify({ ...user.claims, sub: user.id, role: "authenticated", aal: user.aal })
    }, true)`;
    await tx`select set_config('request.jwt.claim.sub', ${user.id}, true)`;
    await tx`set local role authenticated`;
    return await fn(tx as unknown as Sql);
  })) as T;
}
