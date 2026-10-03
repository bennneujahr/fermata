"use server";
import { revalidatePath } from "next/cache";
import type { ActionState } from "@/app/actions/state";
import { berlinLocalToIso } from "@/app/admin/_lib/format";
import { errorKey, rpc } from "@/app/admin/_lib/rpc";
import type { CaseSession, TranscriptResult } from "@/app/admin/_lib/types";
import { adminSafety as c } from "@/copy/admin-sicherheit";
import { fail, isUuid, opt, str } from "./util";

function refresh(...extra: string[]) {
  revalidatePath("/admin/sicherheit", "layout");
  revalidatePath("/admin");
  for (const p of extra) revalidatePath(p);
}

export async function takeReportAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const id = str(fd, "report_id");
  if (!isUuid(id)) return { error: "report_not_found" };
  const r = await rpc("admin_set_report_status", { p_report_id: id, p_status: "in_review" });
  if (r.error) return fail(r.error);
  refresh();
  return { ok: true, message: c.report.takeReviewDone };
}

export async function decideReportAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const id = str(fd, "report_id");
  const decision = str(fd, "decision");
  const resolution = str(fd, "resolution");
  if (!isUuid(id)) return { error: "report_not_found" };
  if (decision !== "resolved" && decision !== "dismissed") return { error: "invalid_decision" };
  if (resolution.length < 3) return { error: "resolution_required" };
  const hasProvisional = fd.get("has_provisional") === "1";
  const lift = hasProvisional ? fd.get("lift_provisional") === "on" : null;
  const r = await rpc<{ lifted_provisional: number }>("admin_decide_report", {
    p_report_id: id,
    p_decision: decision,
    p_resolution: resolution,
    p_lift_provisional: lift,
  });
  if (r.error) return fail(r.error);
  refresh();
  return { ok: true, message: c.report.decided(r.data?.lifted_provisional ?? 0) };
}

export async function imposeSanctionAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = str(fd, "user_id");
  const kind = str(fd, "kind");
  const reason = str(fd, "reason");
  const reportId = opt(fd, "report_id");
  const endsLocal = opt(fd, "ends_at");
  if (!isUuid(user)) return { error: "user_not_found" };
  if (!["hinweis", "sperre", "ausschluss"].includes(kind)) return { error: "invalid_kind" };
  if (reason.length < 3) return { error: "reason_required" };
  let endsAt: string | null = null;
  if (kind === "sperre" && endsLocal) {
    endsAt = berlinLocalToIso(endsLocal);
    if (!endsAt) return { error: "invalid_end" };
  }
  const r = await rpc<{ cancelled_evenings: number; doc_hash_missing: boolean }>("admin_impose_sanction", {
    p_user: user,
    p_kind: kind,
    p_reason: reason,
    p_ends_at: endsAt,
    p_report_id: reportId && isUuid(reportId) ? reportId : null,
    p_blocklist_reason: null,
  });
  if (r.error) return fail(r.error);
  refresh(`/admin/konten/${user}`);
  const msg = c.sanction.done(r.data?.cancelled_evenings ?? 0);
  return { ok: true, message: r.data?.doc_hash_missing ? `${msg} ${c.sanction.docHashMissing}` : msg };
}

export async function liftSanctionAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const id = str(fd, "sanction_id");
  const reason = str(fd, "reason");
  if (!isUuid(id)) return { error: "sanction_not_active" };
  if (reason.length < 3) return { error: "reason_required" };
  const r = await rpc<boolean>("admin_lift_sanction", { p_sanction_id: id, p_reason: reason });
  if (r.error) return fail(r.error);
  if (r.data === false) return { error: "sanction_not_active" };
  refresh();
  return { ok: true, message: c.lift.done };
}

export async function decideAppealAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const id = str(fd, "appeal_id");
  const decision = str(fd, "decision");
  const note = str(fd, "note");
  if (!isUuid(id)) return { error: "appeal_not_found" };
  if (decision !== "accepted" && decision !== "rejected") return { error: "invalid_decision" };
  if (note.length < 3) return { error: "note_required" };
  const r = await rpc<{ sanction_lifted: boolean }>("admin_decide_appeal", { p_appeal_id: id, p_decision: decision, p_note: note });
  if (r.error) return fail(r.error);
  refresh();
  return { ok: true, message: c.appeals.done(Boolean(r.data?.sanction_lifted)) };
}

export async function reviewFlagAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const id = str(fd, "flag_id");
  const outcome = str(fd, "outcome");
  if (!isUuid(id)) return { error: "not_found" };
  if (outcome.length < 2) return { error: "outcome_required" };
  const r = await rpc<boolean>("admin_review_flag", { p_flag_id: id, p_outcome: outcome });
  if (r.error) return fail(r.error);
  refresh();
  return { ok: true, message: c.flags.reviewDone };
}

/** Gespräche (nur Metadaten) einer Person mit offenem Sicherheitsfall. */
export async function listCaseSessions(userId: string): Promise<{ sessions?: CaseSession[]; error?: string }> {
  if (!isUuid(userId)) return { error: "not_found" };
  const r = await rpc<CaseSession[]>("admin_case_sessions", { p_user: userId });
  if (r.error) return { error: errorKey(r.error) };
  return { sessions: r.data ?? [] };
}

/** Transkript eines Gesprächs für einen Sicherheitsfall (api.admin_safety_transcript, Bereich Härtung). */
export async function openTranscript(input: { sessionId: string; reason: string }): Promise<{ transcript?: TranscriptResult; error?: string }> {
  if (!isUuid(input.sessionId)) return { error: "not_found" };
  const reason = (input.reason ?? "").trim();
  if (reason.length < 10) return { error: "reason_required" };
  const r = await rpc<TranscriptResult>("admin_safety_transcript", { p_session_id: input.sessionId, p_reason: reason.slice(0, 1000) });
  if (r.error) return { error: r.error.hint ?? (r.error.code === "P0002" ? "not_found" : "generic") };
  const t = r.data ?? { session: null, turns: [], deleted: false };
  return { transcript: { session: t.session ?? null, turns: Array.isArray(t.turns) ? t.turns : [], deleted: Boolean(t.deleted) } };
}
