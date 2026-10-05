// Supabase Auth (GoTrue) Admin-API mit dem service_role-Schlüssel. Nur serverseitig.
import { authFetch, supabaseUrl } from "./auth.ts";
import { env } from "./env.ts";
import { HttpError } from "./http.ts";

function headers(): Record<string, string> {
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  return { authorization: `Bearer ${key}`, apikey: key, "content-type": "application/json" };
}

/** Legt eine Person mit bestätigter E-Mail an (Anmeldung danach per Code). Liefert die ID. */
export async function adminCreateUser(email: string): Promise<string> {
  const res = await authFetch()(`${supabaseUrl()}/auth/v1/admin/users`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ email, email_confirm: true }),
  });
  if (res.status === 422 || res.status === 409) throw new HttpError(409, "user_exists");
  if (!res.ok) throw new HttpError(502, "auth_unavailable");
  const body = (await res.json()) as { id?: string; user?: { id?: string } };
  const id = body.id ?? body.user?.id;
  if (!id) throw new HttpError(502, "auth_unavailable");
  return id;
}

/** Löscht eine Person in Supabase Auth (Fremdschlüssel mit on delete cascade löschen mit). */
export async function adminDeleteUser(id: string): Promise<void> {
  const res = await authFetch()(`${supabaseUrl()}/auth/v1/admin/users/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: headers(),
  });
  if (res.status === 404) return;
  if (!res.ok) throw new HttpError(502, "auth_unavailable");
}
