"use server";
// Freie Abende speichern (api.set_availability ersetzt alle Fenster des Zeitraums; Regeln in der Datenbank).
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

export type AvailabilityResult = { ok: true; windows: { window_id: string; starts_at: string; ends_at: string }[] } | { ok: false; error: string };

export async function setAvailabilityAction(periodId: string, windows: { starts_at: string; ends_at: string }[]): Promise<AvailabilityResult> {
  if (!UUID.test(periodId)) return { ok: false, error: "period_not_found" };
  if (!Array.isArray(windows) || windows.length > 50) return { ok: false, error: "invalid_input" };
  const clean = windows.map((w) => ({ starts_at: String(w?.starts_at ?? ""), ends_at: String(w?.ends_at ?? "") }));
  if (clean.some((w) => !ISO.test(w.starts_at) || !ISO.test(w.ends_at))) return { ok: false, error: "invalid_input" };
  const supabase = await createClient();
  const { data, error } = await supabase.schema("api").rpc("set_availability", { p_period_id: periodId, p_windows: clean });
  if (error) return { ok: false, error: error.hint || "generic" };
  revalidatePath("/zeiten", "layout");
  revalidatePath("/abende");
  revalidatePath("/start");
  return { ok: true, windows: (data ?? []) as { window_id: string; starts_at: string; ends_at: string }[] };
}
