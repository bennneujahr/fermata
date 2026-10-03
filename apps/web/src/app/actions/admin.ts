"use server";
import { revalidatePath } from "next/cache";
import { callFunction } from "@/lib/functions";
import { createClient } from "@/lib/supabase/server";
import { isEmail, normalizeEmail } from "@/lib/validation";
import type { ActionState } from "./state";

export async function inviteAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const email = normalizeEmail(String(fd.get("email") ?? ""));
  if (!isEmail(email)) return { error: "invalid_email", fields: { email: "invalid_email" }, values: { email } };
  const res = await callFunction<{ mail_sent: boolean; is_founding_member: boolean }>("admin-invite", { body: { email } });
  if (!res.ok) return { error: res.error ?? "generic", values: { email } };
  revalidatePath("/admin", "layout");
  return {
    ok: true,
    message: email,
    values: { email: "" },
    fields: { mail: res.data?.mail_sent ? "sent" : "failed", founding: res.data?.is_founding_member ? "yes" : "no" },
  };
}

export async function updateSettingAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const key = String(fd.get("key") ?? "");
  const raw = String(fd.get("value") ?? "");
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { error: "invalid_json", values: { value: raw } };
  }
  const supabase = await createClient();
  const { error } = await supabase.schema("api").rpc("admin_update_setting", { p_key: key, p_value: value });
  if (error) return { error: error.hint || "generic", values: { value: raw } };
  revalidatePath("/admin/einstellungen");
  return { ok: true, values: { value: JSON.stringify(value) } };
}
