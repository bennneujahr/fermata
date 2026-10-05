"use server";
import { revalidatePath } from "next/cache";
import { isUuid } from "@/app/admin/_actions/util";
import { rpc } from "@/app/admin/_lib/rpc";
import { callFunction } from "@/lib/functions";
import { isEmail, normalizeEmail } from "@/lib/validation";

export interface InviteOutcome {
  ok: number;
  failed: { email: string; error: string }[];
}

/** Ausgewählte Einträge der Warteliste in die App einladen (Edge Function admin-invite, je Person einzeln). */
export async function inviteFromWaitlist(entries: { id: string; email: string }[]): Promise<InviteOutcome> {
  const out: InviteOutcome = { ok: 0, failed: [] };
  for (const e of entries.slice(0, 100)) {
    const email = normalizeEmail(e.email);
    if (!isUuid(e.id) || !isEmail(email)) {
      out.failed.push({ email: e.email, error: "invalid_email" });
      continue;
    }
    const r = await callFunction<{ invited: boolean }>("admin-invite", { body: { email, waitlist_id: e.id } });
    if (r.ok) out.ok++;
    else out.failed.push({ email, error: r.error ?? "generic" });
  }
  revalidatePath("/admin/warteliste");
  revalidatePath("/admin/einladen");
  revalidatePath("/admin");
  return out;
}

/** Weiteren Einladungscode für einen bestätigten Eintrag (api.admin_waitlist_grant_invite). */
export async function grantWaitlistInvite(id: string): Promise<{ code?: string; error?: string }> {
  if (!isUuid(id)) return { error: "waitlist_missing" };
  const r = await rpc<string>("admin_waitlist_grant_invite", { p_waitlist_id: id });
  if (r.error) return { error: r.error.hint ?? (r.error.code === "P0002" ? "waitlist_missing" : "generic") };
  revalidatePath("/admin/warteliste");
  return { code: r.data ?? "" };
}
