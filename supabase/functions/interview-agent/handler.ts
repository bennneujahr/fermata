// interview-agent: Einziger Schreibweg des Viola-Dienstes in die Datenbank (PLAN 2.3 Nr. 4).
// Aufruf nur vom Python-Dienst mit dem Geheimnis im Header x-agent-secret (= INTERVIEW_AGENT_SECRET),
// Vergleich in konstanter Zeit. Jede Aktion ruft genau eine SQL-Funktion api.agent_* in der Rolle fermata_agent.
// Die SQL-Funktionen prüfen Art.-9-Inhalte erneut (Zusammenfassung, Auswertung) und lehnen Treffer ab.
import { sha256Hex, timingSafeEqual } from "../_shared/crypto.ts";
import { db } from "../_shared/db.ts";
import { optionalEnv } from "../_shared/env.ts";
import { handler, HttpError, json, readJson } from "../_shared/http.ts";
import { isUuid } from "../_shared/interview/auth.ts";
import { asAgent } from "../_shared/interview/db.ts";

type Body = Record<string, unknown> & { action?: unknown; session_id?: unknown };

async function requireSecret(req: Request): Promise<void> {
  const expected = optionalEnv("INTERVIEW_AGENT_SECRET");
  if (!expected || expected.length < 32) throw new HttpError(503, "agent_secret_not_configured");
  const given = req.headers.get("x-agent-secret") ?? "";
  // Vergleich der SHA-256-Werte in konstanter Zeit: gleich lang, verrät weder Inhalt noch Länge.
  const [a, b] = await Promise.all([sha256Hex(given), sha256Hex(expected)]);
  if (!timingSafeEqual(a, b)) throw new HttpError(401, "invalid_agent_secret");
}

function str(v: unknown, name: string, max = 200): string {
  if (typeof v !== "string" || v.length === 0 || v.length > max) throw new HttpError(400, `invalid_${name}`);
  return v;
}

function strArray(v: unknown, name: string): string[] | null {
  if (v === undefined || v === null) return null;
  if (!Array.isArray(v) || v.some((x) => typeof x !== "string" || x.length > 40) || v.length > 20) {
    throw new HttpError(400, `invalid_${name}`);
  }
  return v as string[];
}

function obj(v: unknown, name: string): Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) throw new HttpError(400, `invalid_${name}`);
  return v as Record<string, unknown>;
}

export const ACTIONS = [
  "context",
  "start",
  "ai_notice",
  "append_turns",
  "summary_draft",
  "analysis",
  "analysis_status",
  "safety_flag",
  "costs",
  "switch_mode",
  "end",
] as const;

export default handler(["POST"], async (req) => {
  await requireSecret(req);
  const body = await readJson<Body>(req, 512 * 1024);
  const action = str(body.action, "action", 40);
  if (!isUuid(body.session_id)) throw new HttpError(400, "invalid_session_id");
  const sid = body.session_id;

  const result = await asAgent(db(), async (tx) => {
    switch (action) {
      case "context":
        return (await tx`select api.agent_session_context(${sid}) as r`)[0].r;
      case "start":
        return (await tx`select api.agent_start_session(${sid}) as r`)[0].r;
      case "ai_notice":
        return {
          ai_notice_at:
            (await tx`select api.agent_mark_ai_notice(${sid}, ${str(body.version, "version", 40)}) as r`)[0].r,
        };
      case "append_turns": {
        if (!Array.isArray(body.turns)) throw new HttpError(400, "invalid_turns");
        return { total: (await tx`select api.agent_append_turns(${sid}, ${tx.json(body.turns)}) as r`)[0].r };
      }
      case "summary_draft": {
        const text = str(body.text, "text", 4000);
        const blocks = strArray(body.covered_blocks, "covered_blocks");
        return {
          summary_status: (await tx`select api.agent_save_summary_draft(${sid}, ${text}, ${blocks}::text[]) as r`)[0].r,
        };
      }
      case "analysis":
        return (await tx`select api.agent_save_analysis(${sid}, ${tx.json(obj(body.analysis, "analysis"))}) as r`)[0].r;
      case "analysis_status":
        await tx`select api.agent_mark_analysis(${sid}, ${str(body.status, "status", 20)})`;
        return { ok: true };
      case "safety_flag": {
        const turnIndex = typeof body.turn_index === "number" && Number.isInteger(body.turn_index)
          ? body.turn_index
          : null;
        const detector = typeof body.detector === "string" ? body.detector : "viola";
        const id =
          (await tx`select api.agent_flag_safety(${sid}, ${str(body.kind, "kind", 40)}, ${
            str(body.severity, "severity", 20)
          },
          ${detector}, ${turnIndex}) as r`)[0].r;
        return { flag_id: id };
      }
      case "costs":
        return {
          id: String((await tx`select api.agent_record_costs(${sid}, ${tx.json(obj(body.costs, "costs"))}) as r`)[0].r),
        };
      case "switch_mode":
        return { mode: (await tx`select api.agent_switch_mode(${sid}, ${str(body.mode, "mode", 10)}) as r`)[0].r };
      case "end": {
        const blocks = strArray(body.covered_blocks, "covered_blocks");
        return (await tx`select api.agent_end_session(${sid}, ${
          str(body.reason, "reason", 40)
        }, ${blocks}::text[]) as r`)[0].r;
      }
      default:
        throw new HttpError(400, "unknown_action");
    }
  });
  return json(req, result ?? {});
});
