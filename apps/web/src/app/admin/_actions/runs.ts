"use server";
import { revalidatePath } from "next/cache";
import type { ActionState } from "@/app/actions/state";
import { errorKey, rpc } from "@/app/admin/_lib/rpc";
import { adminRuns as c } from "@/copy/admin-auswahl";
import { fail, isUuid, str } from "./util";

export interface DecideResult {
  ok: boolean;
  status?: string;
  error?: string;
  message?: string;
}

/** Einen Vorschlag freigeben oder ablehnen (api.admin_approve_pairing / api.admin_reject_pairing). */
export async function decidePairing(input: { runId: string; pairingId: string; decision: "approve" | "reject"; comment: string }): Promise<DecideResult> {
  if (!isUuid(input.runId) || !isUuid(input.pairingId)) return { ok: false, error: "not_found" };
  const comment = (input.comment ?? "").trim().slice(0, 1000);
  if (input.decision === "reject" && comment.length < 3) return { ok: false, error: "comment_required" };
  const fn = input.decision === "approve" ? "admin_approve_pairing" : "admin_reject_pairing";
  const r = await rpc<{ status: string }>(fn, { p_pairing_id: input.pairingId, p_comment: comment || null });
  if (r.error) {
    const key = errorKey(r.error);
    return { ok: false, error: key, message: key === "db_message" ? r.error.message : undefined };
  }
  revalidatePath(`/admin/auswahl/${input.runId}`);
  revalidatePath("/admin");
  return { ok: true, status: r.data?.status };
}

/** Sammelfreigabe: nur die übergebenen Vorschläge (die Oberfläche bietet nur solche ohne Warnung an). */
export async function bulkApprove(input: { runId: string; pairingIds: string[] }): Promise<{ ok: number; failed: { id: string; message: string }[] }> {
  const failed: { id: string; message: string }[] = [];
  let ok = 0;
  for (const id of input.pairingIds.filter(isUuid).slice(0, 500)) {
    const r = await rpc<{ status: string }>("admin_approve_pairing", { p_pairing_id: id, p_comment: null });
    if (r.error) failed.push({ id, message: r.error.message });
    else ok++;
  }
  revalidatePath(`/admin/auswahl/${input.runId}`);
  revalidatePath("/admin");
  return { ok, failed };
}

/** Lauf abschließen (api.admin_finish_run). */
export async function finishRunAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const runId = str(fd, "run_id");
  if (!isUuid(runId)) return { error: "not_found" };
  const rejectPending = fd.get("reject_pending") === "on";
  const r = await rpc<{ status: string }>("admin_finish_run", { p_run_id: runId, p_reject_pending: rejectPending });
  if (r.error) return fail(r.error);
  revalidatePath(`/admin/auswahl/${runId}`);
  revalidatePath("/admin/auswahl");
  revalidatePath("/admin");
  return { ok: true, message: c.finish.done(c.status[r.data?.status ?? ""] ?? r.data?.status ?? "") };
}
