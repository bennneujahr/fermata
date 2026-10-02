// Tests gegen die Test-Datenbank des Bereichs Viola (DB_PORT=54352, vorher scripts/db.sh migrate).
import { assertEquals } from "@std/assert";
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
import agentHandler from "../interview-agent/handler.ts";
import tokenHandler from "../interview-token/handler.ts";
import handler from "./handler.ts";

setTestEnv();
const people: Person[] = [];
const opts = { sanitizeOps: false, sanitizeResources: false };

async function sessionWithDraft(p: Person): Promise<string> {
  const res = await tokenHandler(
    post("interview-token", { kind: "erstgespraech", mode: "text" }, {
      authorization: `Bearer ${await memberToken(p.id)}`,
    }),
  );
  const sid = (await res.json()).session.id as string;
  for (
    const body of [
      { action: "start" },
      { action: "summary_draft", text: "Sie sind ruhig, neugierig und wandern gern. Humor ist Ihnen wichtig." },
    ]
  ) {
    const r = await agentHandler(
      post("interview-agent", { session_id: sid, ...body }, { "x-agent-secret": AGENT_SECRET }),
    );
    assertEquals(r.status, 200, await r.text());
  }
  return sid;
}

async function call(
  method: "GET" | "POST",
  token: string,
  body?: unknown,
  query = "",
): Promise<{ status: number; body: Record<string, any> }> {
  const req = method === "GET"
    ? new Request(`http://localhost/functions/v1/interview-summary${query}`, {
      headers: { authorization: `Bearer ${token}` },
    })
    : post("interview-summary", body, { authorization: `Bearer ${token}` });
  const res = await handler(req);
  return { status: res.status, body: await res.json() };
}

Deno.test({
  name: "interview-summary: Entwurf lesen, nur eigene Gespräche",
  ...opts,
  fn: async () => {
    testDb();
    const anna = await createPerson();
    const bert = await createPerson();
    people.push(anna, bert);
    const sid = await sessionWithDraft(anna);
    const own = await call("GET", await memberToken(anna.id), undefined, `?session_id=${sid}`);
    assertEquals(own.status, 200);
    assertEquals(own.body.summary_status, "draft");
    assertEquals(own.body.summary_draft, "Sie sind ruhig, neugierig und wandern gern. Humor ist Ihnen wichtig.");
    const other = await call("GET", await memberToken(bert.id), undefined, `?session_id=${sid}`);
    assertEquals(other.status, 404);
    const otherPost = await call("POST", await memberToken(bert.id), { session_id: sid, action: "confirm" });
    assertEquals(otherPost.status, 404);
  },
});

Deno.test({
  name: "interview-summary: Korrektur mit Art.-9-Inhalt abgelehnt, Bestätigung gespeichert",
  ...opts,
  fn: async () => {
    const p = await createPerson();
    people.push(p);
    const sid = await sessionWithDraft(p);
    const token = await memberToken(p.id);
    const bad = await call("POST", token, {
      session_id: sid,
      action: "correct",
      text: "Ich bin ruhig und habe Diabetes, das sollte man wissen.",
    });
    assertEquals(bad.status, 422);
    assertEquals(bad.body.error, "art9_content");
    assertEquals(bad.body.message, "gesundheit");
    const ok = await call("POST", token, { session_id: sid, action: "confirm" });
    assertEquals(ok.status, 200);
    assertEquals(ok.body.summary_status, "confirmed");
    assertEquals(ok.body.summary_version, 1);
    const again = await call("POST", token, { session_id: sid, action: "confirm" });
    assertEquals(again.status, 409);
    assertEquals(again.body.error, "no_draft");
    const rows = await testDb()`select summary_text from app.profile_core where user_id = ${p.id}`;
    assertEquals(rows[0]!.summary_text, "Sie sind ruhig, neugierig und wandern gern. Humor ist Ihnen wichtig.");
    assertEquals((await call("POST", token, { session_id: sid, action: "loeschen" })).status, 422);
  },
});

Deno.test({
  name: "interview-summary: aufräumen",
  ...opts,
  fn: async () => {
    await removePeople(people);
    await closeDb();
  },
});
