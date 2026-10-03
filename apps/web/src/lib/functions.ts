// Aufrufe der Edge Functions vom Server aus, mit dem Token der angemeldeten Person.
import "server-only";
import { functionsUrl, supabaseAnonKey } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export interface FunctionResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
}

export async function callFunction<T = unknown>(
  name: string,
  init: { method?: "GET" | "POST"; body?: unknown } = {},
): Promise<FunctionResult<T>> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { ok: false, status: 401, data: null, error: "unauthorized" };
  let res: Response;
  try {
    res = await fetch(`${functionsUrl()}/${name}`, {
      method: init.method ?? "POST",
      headers: {
        authorization: `Bearer ${token}`,
        apikey: supabaseAnonKey(),
        ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
        // Supabase führt die Function in Frankfurt aus (PLAN 2.1).
        "x-region": "eu-central-1",
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    });
  } catch {
    return { ok: false, status: 503, data: null, error: "network" };
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  const error = !res.ok ? ((body as { error?: string } | null)?.error ?? `http_${res.status}`) : null;
  return { ok: res.ok, status: res.status, data: res.ok ? (body as T) : null, error };
}
