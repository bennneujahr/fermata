"use server";
// Mitteilungen (Web-Push): öffentlicher VAPID-Schlüssel (push-key), Abo speichern und entfernen.
import { revalidatePath } from "next/cache";
import { functionsUrl, supabaseAnonKey } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export type PushResult = { ok: true } | { ok: false; error: string };

export async function vapidKeyAction(): Promise<{ ok: true; key: string } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${functionsUrl()}/push-key`, { headers: { apikey: supabaseAnonKey() }, cache: "no-store" });
    const body = (await res.json().catch(() => null)) as { publicKey?: string; error?: string } | null;
    if (!res.ok || !body?.publicKey) return { ok: false, error: body?.error ?? "push_not_configured" };
    return { ok: true, key: body.publicKey };
  } catch {
    return { ok: false, error: "push_not_configured" };
  }
}

export async function savePushSubscriptionAction(input: { endpoint: string; p256dh: string; auth: string; platform: string | null }): Promise<PushResult> {
  const platform = input.platform && ["ios", "android", "desktop"].includes(input.platform) ? input.platform : null;
  const supabase = await createClient();
  const { error } = await supabase.schema("api").rpc("save_push_subscription", {
    p_endpoint: String(input.endpoint ?? ""),
    p_p256dh: String(input.p256dh ?? ""),
    p_auth: String(input.auth ?? ""),
    p_platform: platform,
  });
  if (error) return { ok: false, error: error.hint || "generic" };
  revalidatePath("/konto", "layout");
  return { ok: true };
}

/** Abo dieses Geräts entfernen (über die Adresse des Push-Dienstes). */
export async function deletePushSubscriptionAction(endpoint: string): Promise<PushResult> {
  const supabase = await createClient();
  const { error } = await supabase.schema("api").rpc("delete_push_subscription", { p_endpoint: String(endpoint ?? "") });
  if (error) return { ok: false, error: error.hint || "generic" };
  revalidatePath("/konto", "layout");
  return { ok: true };
}

/** Abo eines anderen Geräts entfernen (RLS: nur eigene Zeilen). */
export async function deletePushByIdAction(id: string): Promise<PushResult> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, error: "generic" };
  const supabase = await createClient();
  const { error } = await supabase.schema("app").from("push_subscriptions").delete().eq("id", id);
  if (error) return { ok: false, error: "generic" };
  revalidatePath("/konto", "layout");
  return { ok: true };
}
