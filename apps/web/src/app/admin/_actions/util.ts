// Hilfen für die Server Actions des Admin-Bereichs (kein "use server": nur intern importiert).
import "server-only";
import { revalidatePath } from "next/cache";
import type { ActionState } from "@/app/actions/state";
import { errorKey, rpc, type RpcError } from "@/app/admin/_lib/rpc";

export function fail(e: RpcError | null): ActionState {
  const key = errorKey(e);
  return { error: key, message: key === "db_message" ? e?.message : undefined };
}

/** RPC ausführen, bei Erfolg Pfade neu laden und eine Meldung zurückgeben. */
export async function call<T>(fn: string, args: Record<string, unknown>, ok: (data: T) => string, paths: string[]): Promise<ActionState & { data?: T }> {
  const r = await rpc<T>(fn, args);
  if (r.error) return fail(r.error);
  for (const p of paths) revalidatePath(p);
  return { ok: true, message: ok(r.data as T) };
}

export const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
export const opt = (fd: FormData, k: string) => {
  const v = str(fd, k);
  return v === "" ? null : v;
};
export const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
