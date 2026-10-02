// Tests gegen die Test-Datenbank des Bereichs Viola (DB_PORT=54352, vorher scripts/db.sh migrate).
import { assert, assertEquals } from "@std/assert";
import { verifyHs256 } from "../_shared/interview/jwt.ts";
import {
  closeDb,
  createPerson,
  LIVEKIT_SECRET,
  memberToken,
  type Person,
  post,
  removePeople,
  setTestEnv,
  testDb,
  TEXT_SECRET,
} from "../_shared/interview/test_helpers.ts";
import handler from "./handler.ts";

setTestEnv();
const people: Person[] = [];
const opts = { sanitizeOps: false, sanitizeResources: false };

async function call(body: unknown, token?: string): Promise<{ status: number; body: Record<string, any> }> {
  const res = await handler(post("interview-token", body, token ? { authorization: `Bearer ${token}` } : {}));
  return { status: res.status, body: await res.json() };
}

Deno.test({
  name: "interview-token: ohne Anmeldung 401",
  ...opts,
  fn: async () => {
    testDb();
    const r = await call({ kind: "erstgespraech" });
    assertEquals(r.status, 401);
    assertEquals(r.body.error, "not_authenticated");
  },
});

Deno.test({
  name: "interview-token: gefälschter Token 401",
  ...opts,
  fn: async () => {
    const p = await createPerson();
    people.push(p);
    const token = (await memberToken(p.id)).slice(0, -3) + "abc";
    assertEquals((await call({}, token)).status, 401);
  },
});

Deno.test({
  name: "interview-token: ohne Einwilligung 403 consent_missing",
  ...opts,
  fn: async () => {
    const p = await createPerson({ consent: false });
    people.push(p);
    const r = await call({ kind: "erstgespraech", mode: "voice" }, await memberToken(p.id));
    assertEquals(r.status, 403);
    assertEquals(r.body.error, "consent_missing");
  },
});

Deno.test({
  name: "interview-token: ohne Ausweisprüfung 403 not_verified",
  ...opts,
  fn: async () => {
    const p = await createPerson({ verified: false });
    people.push(p);
    const r = await call({ kind: "erstgespraech", mode: "voice" }, await memberToken(p.id));
    assertEquals(r.status, 403);
    assertEquals(r.body.error, "not_verified");
  },
});

Deno.test({
  name: "interview-token: Stimme liefert LiveKit-Zugang mit Agent-Auftrag",
  ...opts,
  fn: async () => {
    const p = await createPerson({ addressForm: "du" });
    people.push(p);
    const r = await call({ kind: "erstgespraech", mode: "voice" }, await memberToken(p.id));
    assertEquals(r.status, 200);
    const session = r.body.session;
    assertEquals(session.kind, "erstgespraech");
    assertEquals(session.address_form, "du");
    assertEquals(session.room_name, session.id);
    assert(r.body.ai_notice.includes("künstliche Intelligenz"));
    assertEquals(r.body.voice.url, "wss://livekit.fermata.test");
    const claims = await verifyHs256(r.body.voice.token, LIVEKIT_SECRET);
    assertEquals((claims.video as any).room, session.id);
    assertEquals((claims.roomConfig as any).agents[0].agentName, "viola");
    assertEquals(JSON.parse((claims.roomConfig as any).agents[0].metadata).session_id, session.id);
    assert(!String(claims.sub).includes(p.id), "LiveKit erfährt die Konto-ID nicht");
    const rows = await testDb()`select status from app.interview_sessions where id = ${session.id}`;
    assertEquals(rows[0]!.status, "requested");
  },
});

Deno.test({
  name: "interview-token: Text liefert Zugang zum Textmodus",
  ...opts,
  fn: async () => {
    const p = await createPerson();
    people.push(p);
    const r = await call({ kind: "erstgespraech", mode: "text" }, await memberToken(p.id));
    assertEquals(r.status, 200);
    assert(r.body.text.url.endsWith(`/v1/text/sessions/${r.body.session.id}`));
    const claims = await verifyHs256(r.body.text.token, TEXT_SECRET);
    assertEquals(claims.aud, "viola-text");
    assertEquals(claims.sid, r.body.session.id);
    assertEquals(claims.sub, p.id);
    assertEquals(r.body.voice, undefined);
  },
});

Deno.test({
  name: "interview-token: Stimme ohne LiveKit 503, Eingaben werden geprüft",
  ...opts,
  fn: async () => {
    const p = await createPerson();
    people.push(p);
    const token = await memberToken(p.id);
    Deno.env.delete("LIVEKIT_URL");
    try {
      const r = await call({ kind: "erstgespraech", mode: "voice" }, token);
      assertEquals(r.status, 503);
      assertEquals(r.body.error, "voice_unavailable");
    } finally {
      setTestEnv();
    }
    assertEquals((await call({ kind: "erstgespraech", evening_id: "kein-uuid" }, token)).status, 400);
    const bad = await call({ kind: "vertiefung", mode: "voice" }, token);
    assertEquals(bad.status, 403);
    assertEquals(bad.body.error, "kind_not_allowed");
    const res = await handler(new Request("http://localhost/functions/v1/interview-token", { method: "OPTIONS" }));
    assertEquals(res.status, 204);
  },
});

Deno.test({
  name: "interview-token: aufräumen",
  ...opts,
  fn: async () => {
    await removePeople(people);
    await closeDb();
  },
});
