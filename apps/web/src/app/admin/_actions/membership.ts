"use server";
import { revalidatePath } from "next/cache";
import type { ActionState } from "@/app/actions/state";
import { berlinLocalToIso } from "@/app/admin/_lib/format";
import { rpc } from "@/app/admin/_lib/rpc";
import { adminMembership as c } from "@/copy/admin-mitgliedschaft";
import { fail, isUuid, opt, str } from "./util";

/** Kontingent einer Person korrigieren (api.admin_ledger_adjust), Begründung Pflicht. */
export async function ledgerAdjustAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = str(fd, "user_id");
  const amount = Number(str(fd, "amount").replace("−", "-"));
  const note = str(fd, "note");
  const expiresLocal = opt(fd, "expires_at");
  if (!isUuid(user)) return { error: "invalid_input" };
  if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > 20 || note.length < 3) return { error: "invalid_input" };
  const expires = amount > 0 && expiresLocal ? berlinLocalToIso(`${expiresLocal}T23:59`) : null;
  const r = await rpc<number>("admin_ledger_adjust", { p_user: user, p_amount: amount, p_note: note, p_expires_at: expires });
  if (r.error) return fail(r.error);
  revalidatePath("/admin/mitgliedschaft");
  revalidatePath(`/admin/konten/${user}`);
  return { ok: true, message: c.ledger.done };
}
