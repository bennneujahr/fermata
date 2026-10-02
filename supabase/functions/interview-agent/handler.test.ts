// Tests gegen die Test-Datenbank des Bereichs Viola (DB_PORT=54352, vorher scripts/db.sh migrate).
import { assert, assertEquals } from "@std/assert";
import {
  AGENT_SECRET,
  closeDb,
  createPerson,
  memberToken,
  type Person,
  post,
  removePeople,
  setTestEnv,
  testDb,
} from "../_shared/interview/test_helpers.ts";
import tokenHandler from "../interview-token/handler.ts";
import handler from "./handler.ts";

setTestEnv();
const people: Person[] = [];
const opts = { sanitizeOps: false, sanitizeResources: false };

async function agent(
  body: Record<string, unknown>,
  secret = AGENT_SECRET,
): Promise<{ status: number; body: Record<string, any> }> {
  const res = await handler(post("interview-agent", body, { "x-agent-secret": secret }));
  return { status: res.status, body: await res.json() };
}

async function newSession(p: Person, mode = "voice"): Promise<string> {
  const res = await tokenHandler(
    post("interview-token", { kind: "erstgespraech", mode }, { authorization: `Bearer ${await memberToken(p.id)}` }),
  );
  const body = await res.json();
  assertEquals(res.status, 200, JSON.stringify(body));
  return body.session.id as string;
}

Deno.test({
  name: "interview-agent: ohne oder mit falschem Geheimnis 401",
  ...opts,
  fn: async () => {
    testDb();
    const res = await handler(post("interview-agent", { action: "context", session_id: crypto.randomUUID() }));
    assertEquals(res.status, 401);
    assertEquals(
      (await agent({ action: "context", session_id: crypto.randomUUID() }, AGENT_SECRET.replace("a", "b"))).status,
      401,
    );
    // Ein Mitglied mit gültigem Login kommt hier nicht weiter.
    const p = await createPerson();
    people.push(p);
    const member = await handler(
      post("interview-agent", { action: "context", session_id: crypto.randomUUID() }, {
        authorization: `Bearer ${await memberToken(p.id)}`,
      }),
    );
    assertEquals(member.status, 401);
  },
});

Deno.test({
  name: "interview-agent: zu kurzes Geheimnis in der Umgebung wird nicht akzeptiert",
  ...opts,
  fn: async () => {
    Deno.env.set("INTERVIEW_AGENT_SECRET", "kurz");
    try {
      const r = await agent({ action: "context", session_id: crypto.randomUUID() }, "kurz");
      assertEquals(r.status, 503);
    } finally {
      setTestEnv();
    }
  },
});

Deno.test({
  name: "interview-agent: vollständiger Ablauf eines Gesprächs",
  ...opts,
  fn: async () => {
    const p = await createPerson({ addressForm: "sie" });
    people.push(p);
    const sid = await newSession(p);

    const ctx = await agent({ action: "context", session_id: sid });
    assertEquals(ctx.status, 200);
    assertEquals(ctx.body.session.address_form, "sie");
    assertEquals(ctx.body.settings.llm_thinking, "between_tools");
    assertEquals(ctx.body.settings.crisis_lines.notruf, "112");

    assertEquals((await agent({ action: "start", session_id: sid })).body.status, "active");

    const early = await agent({ action: "append_turns", session_id: sid, turns: [{ role: "person", text: "Hallo" }] });
    assertEquals(early.status, 409);
    assertEquals(early.body.error, "ai_notice_missing");

    assert((await agent({ action: "ai_notice", session_id: sid, version: "2026-10-03" })).body.ai_notice_at);
    const turns = await agent({
      action: "append_turns",
      session_id: sid,
      turns: [
        { role: "viola", text: "Guten Tag, ich bin Viola, eine künstliche Intelligenz." },
        { role: "person", text: "Hallo Viola, ich wandere gern." },
      ],
    });
    assertEquals(turns.body.total, 2);

    const art9 = await agent({
      action: "summary_draft",
      session_id: sid,
      text: "Sie sind ruhig und gehen jeden Sonntag in die Kirche.",
    });
    assertEquals(art9.status, 422);
    assertEquals(art9.body.error, "art9_content");
    assertEquals(art9.body.message, "religion");

    const draft = await agent({
      action: "summary_draft",
      session_id: sid,
      text: "Sie sind ruhig, wandern gern und wünschen sich ein Gegenüber mit Humor.",
      covered_blocks: ["persoenlichkeit", "wuensche"],
    });
    assertEquals(draft.status, 200);

    const analysis = await agent({
      action: "analysis",
      session_id: sid,
      analysis: {
        personality: { traits: ["ruhig"] },
        travel_modes: ["oepnv"],
        travel_max_minutes: 45,
        wants: [{ category: "persoenlichkeit", text: "Humor", importance: 3 }],
        dealbreakers: [],
      },
    });
    assertEquals(analysis.status, 200, JSON.stringify(analysis.body));
    assertEquals(analysis.body.wants, 1);

    const flag = await agent({
      action: "safety_flag",
      session_id: sid,
      kind: "belaestigung",
      severity: "mittel",
      detector: "regel",
      turn_index: 1,
    });
    assertEquals(flag.status, 200);
    assert(flag.body.flag_id);

    const costs = await agent({
      action: "costs",
      session_id: sid,
      costs: {
        minutes: 3.5,
        stt_seconds: 80,
        llm_input_tokens: 4000,
        llm_output_tokens: 300,
        tts_characters: 900,
        amount_eur: 0.05,
        latency_ms_p50: 950,
        latency_ms_p90: 1600,
        details: { turns: 6 },
      },
    });
    assertEquals(costs.status, 200);

    const end = await agent({ action: "end", session_id: sid, reason: "fertig", covered_blocks: ["persoenlichkeit"] });
    assertEquals(end.body.status, "completed");
    assertEquals((await agent({ action: "nope", session_id: sid })).status, 400);
    assertEquals((await agent({ action: "context", session_id: "keine-uuid" })).status, 400);
    assertEquals((await agent({ action: "context", session_id: crypto.randomUUID() })).status, 404);

    const rows =
      await testDb()`select status, safety_flagged, summary_status from app.interview_sessions where id = ${sid}`;
    assertEquals(rows[0]!.status, "completed");
    assertEquals(rows[0]!.safety_flagged, true);
    assertEquals(rows[0]!.summary_status, "draft");
  },
});

Deno.test({
  name: "interview-agent: Moduswechsel zu Text",
  ...opts,
  fn: async () => {
    const p = await createPerson();
    people.push(p);
    const sid = await newSession(p);
    await agent({ action: "start", session_id: sid });
    assertEquals((await agent({ action: "switch_mode", session_id: sid, mode: "text" })).body.mode, "text");
  },
});

Deno.test({
  name: "interview-agent: aufräumen",
  ...opts,
  fn: async () => {
    await removePeople(people);
    await closeDb();
  },
});
