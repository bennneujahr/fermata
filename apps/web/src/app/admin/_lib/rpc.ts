// Aufrufe der Admin-Funktionen (Schema api). Jede Funktion prüft in der Datenbank app.is_admin() (aal2).
import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface RpcError {
  code: string | null;
  /** Fester Fehlercode aus der Datenbank (hint) oder ein eigener: missing_function, network. */
  hint: string | null;
  message: string;
}

export interface RpcResult<T> {
  data: T | null;
  error: RpcError | null;
}

function normalize(e: { code?: string; hint?: string | null; message?: string } | null): RpcError | null {
  if (!e) return null;
  // PostgREST: Funktion unbekannt (z. B. Migration noch nicht eingespielt).
  if (e.code === "PGRST202" || e.code === "42883") return { code: e.code, hint: "missing_function", message: e.message ?? "" };
  return { code: e.code ?? null, hint: e.hint || null, message: e.message ?? "" };
}

/** RPC ohne Ausnahme: liefert Daten oder einen Fehler mit hint. */
export async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<RpcResult<T>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.schema("api").rpc(fn, args);
    if (error) return { data: null, error: normalize(error) };
    return { data: data as T, error: null };
  } catch {
    return { data: null, error: { code: null, hint: "network", message: "" } };
  }
}

/** RPC für Server Components: wirft bei Fehlern (Fehlerseite der App). */
export async function rpcOrThrow<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const r = await rpc<T>(fn, args);
  if (r.error) throw Object.assign(new Error(`${fn}: ${r.error.message}`), { code: r.error.code, hint: r.error.hint });
  return r.data as T;
}

/** Direktes Lesen von Tabellen, die Admins per RLS lesen dürfen (app.venues, app.venue_slots, billing.evening_ledger …). */
export async function adminFrom(schema: "app" | "billing", table: string) {
  const supabase = await createClient();
  return supabase.schema(schema).from(table);
}

/** Fehlertext: zuerst eigener Text zum hint, dann die deutsche Meldung der Datenbank bei Zustandsfehlern, sonst allgemein. */
export function errorKey(e: RpcError | null): string {
  if (!e) return "generic";
  return e.hint ?? (e.code === "55000" || e.code === "P0001" ? "db_message" : e.code === "P0002" ? "not_found" : "generic");
}
