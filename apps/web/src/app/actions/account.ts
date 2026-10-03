"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { callFunction } from "@/lib/functions";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "./state";

export async function saveAddressFormAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const form = fd.get("address_form");
  const supabase = await createClient();
  const { error } = await supabase.schema("api").rpc("save_address_form", { p_form: form });
  if (error) return { error: error.hint || "generic" };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function revokeConsentAction(kind: string): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.schema("api").rpc("revoke_consent", { p_kind: kind });
  if (error) return { error: error.hint || "generic" };
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Schritt 2 der Löschung: Edge Function account-delete, danach abmelden. */
export async function deleteAccountAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  if (fd.get("confirm") !== "on") return { error: "confirm", fields: { confirm: "required" } };
  const res = await callFunction<{ deleted: boolean }>("account-delete", { body: { confirm: true } });
  if (!res.ok) return { error: res.error ?? "generic" };
  const supabase = await createClient();
  // Die Person existiert nicht mehr; lokal abmelden genügt (Cookie entfernen).
  await supabase.auth.signOut({ scope: "local" });
  redirect("/abgemeldet?grund=geloescht");
}
