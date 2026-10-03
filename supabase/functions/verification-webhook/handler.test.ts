import { assert, assertEquals } from "@std/assert";
import { cleanup, createMember, dbTest, onboard, req, setupWebTests } from "../_shared/web_test_utils.ts";
import { signDiditBody } from "../_shared/didit/mod.ts";
import start from "../verification-start/handler.ts";
import webhook from "./handler.ts";

const env = setupWebTests();
const DOMAIN = "webhook.deno.test";

async function signed(body: unknown, secret = "test-webhook-secret", ts?: number): Promise<Request> {
  const raw = JSON.stringify(body);
  return req("verification-webhook", { body: raw, headers: await signDiditBody(raw, secret, ts) });
}

function decision(sessionId: string, status: string, idv: Record<string, unknown>) {
  return {
    session_id: sessionId,
    status,
    webhook_type: "status.updated",
    decision: { session_id: sessionId, status, id_verification: idv },
  };
}

async function startFor(email: string, facts = { first: "Anna", last: "Albers", birth: "1990-05-17" }) {
  const m = await createMember(env, email);
  await onboard(env, m.id, facts);
  const res = await start(req("verification-start", { token: m.token }));
  assertEquals(res.status, 200);
  const body = await res.json();
  return { ...m, sessionId: env.didit.created.at(-1)!.sessionId, url: body.url as string };
}

dbTest("verification-start: ohne Anmeldung 401, ohne Einwilligung biometrie 403", async () => {
  await cleanup(env, DOMAIN);
  assertEquals((await start(req("verification-start"))).status, 401);
  const m = await createMember(env, `ohne@${DOMAIN}`);
  await onboard(env, m.id, { first: "Ohne", last: "Bio", birth: "1990-01-01" }, [
    "agb",
    "datenschutz_kenntnis",
    "art9_profile",
  ]);
  const res = await start(req("verification-start", { token: m.token }));
  assertEquals(res.status, 403);
  assertEquals((await res.json()).error, "consent_missing");
  assertEquals(env.didit.created.length, 0);
  await cleanup(env, DOMAIN);
});

dbTest("verification-start liefert die Simulationsseite und legt die Prüfung an", async () => {
  await cleanup(env, DOMAIN);
  const s = await startFor(`start@${DOMAIN}`);
  assert(s.url.startsWith("http://localhost:3041/onboarding/ausweis/simulation?sitzung=fake_"));
  const [v] = await env.sql`select status, provider_session_id from app.verifications where user_id = ${s.id}::uuid`;
  assertEquals(v!.status, "started");
  assertEquals(v!.provider_session_id, s.sessionId);
  // vendor_data ist die ID der Prüfung, nicht die Person
  assert(env.didit.created.at(-1)!.vendorData !== s.id);
  await cleanup(env, DOMAIN);
});

dbTest("Webhook: falsche oder veraltete Signatur wird abgelehnt", async () => {
  await cleanup(env, DOMAIN);
  const s = await startFor(`sig@${DOMAIN}`);
  const body = decision(s.sessionId, "Approved", {
    first_name: "Anna",
    last_name: "Albers",
    date_of_birth: "1990-05-17",
  });
  assertEquals((await webhook(await signed(body, "falsch"))).status, 401);
  assertEquals(
    (await webhook(await signed(body, "test-webhook-secret", Math.floor(Date.now() / 1000) - 3600))).status,
    401,
  );
  assertEquals((await webhook(req("verification-webhook", { body }))).status, 401);
  const [v] = await env.sql`select status from app.verifications where user_id = ${s.id}::uuid`;
  assertEquals(v!.status, "started");
  await cleanup(env, DOMAIN);
});

dbTest("Webhook: bestätigt → approved, nur erlaubte Felder, Sitzung gelöscht", async () => {
  await cleanup(env, DOMAIN);
  const s = await startFor(`ok@${DOMAIN}`);
  const res = await webhook(
    await signed(
      decision(s.sessionId, "Approved", {
        first_name: "ANNA",
        last_name: "Albers",
        date_of_birth: "1990-05-17",
        document_number: "T22000129",
        portrait_image: "https://bild",
      }),
    ),
  );
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { ok: true, status: "approved", session_deleted: true });
  const [v] = await env.sql`select * from app.verifications where user_id = ${s.id}::uuid`;
  assertEquals(v!.status, "approved");
  assertEquals(v!.is_adult, true);
  assertEquals(v!.birth_year, 1990);
  assertEquals(v!.name_match, true);
  assertEquals(v!.birth_date_match, true);
  assert(v!.provider_session_deleted_at !== null);
  assert(!JSON.stringify(v).includes("T22000129"));
  assert(env.didit.deleted.includes(s.sessionId));
  const [a] = await env.sql`select status from app.accounts where user_id = ${s.id}::uuid`;
  assertEquals(a!.status, "active");
  // Wiederholter Webhook ändert nichts
  const again = await webhook(await signed(decision(s.sessionId, "Declined", {})));
  assertEquals((await again.json()).status, "approved");
  await cleanup(env, DOMAIN);
});

dbTest("Webhook: Sperrliste (Ausweis) sperrt, Name meldet nur; unbekannte Sitzung wird quittiert", async () => {
  await cleanup(env, DOMAIN);
  await env
    .sql`insert into safety.blocklist (doc_hash, reason_code) values (safety.blocklist_doc_hash('B10CK', '1980-02-02'), 'null_toleranz')`;
  const s = await startFor(`block@${DOMAIN}`, { first: "Bert", last: "Block", birth: "1980-02-02" });
  const res = await webhook(
    await signed(
      decision(s.sessionId, "Approved", {
        first_name: "Bert",
        last_name: "Block",
        date_of_birth: "1980-02-02",
        document_number: "b10ck",
      }),
    ),
  );
  assertEquals((await res.json()).status, "blocked");
  const [a] = await env.sql`select status from app.accounts where user_id = ${s.id}::uuid`;
  assertEquals(a!.status, "suspended");
  const flags = await env.sql`select kind from safety.safety_flags where user_id = ${s.id}::uuid`;
  assertEquals(flags.map((f) => f.kind), ["sperrliste_ausweis"]);

  await env
    .sql`insert into safety.blocklist (name_hash, reason_code) values (safety.blocklist_name_hash('Nora', 'Name', '1970-07-07'), 'sonstiges')`;
  const n = await startFor(`name@${DOMAIN}`, { first: "Nora", last: "Name", birth: "1970-07-07" });
  const r2 = await webhook(
    await signed(
      decision(n.sessionId, "Approved", {
        first_name: "Nora",
        last_name: "Name",
        date_of_birth: "1970-07-07",
        document_number: "NEU123",
      }),
    ),
  );
  assertEquals((await r2.json()).status, "approved");
  const nf = await env.sql`select source from safety.safety_flags where user_id = ${n.id}::uuid`;
  assertEquals(nf.map((f) => f.source), ["blocklist_name"]);

  const unknown = await webhook(await signed(decision("gibt-es-nicht", "Approved", {})));
  assertEquals(await unknown.json(), { ok: true, ignored: "unknown_session" });
  const notFinal = await webhook(await signed({ session_id: n.sessionId, status: "In Progress" }));
  assertEquals(await notFinal.json(), { ok: true, ignored: "not_final" });
  await env
    .sql`delete from safety.blocklist where reason_code in ('null_toleranz', 'sonstiges') and created_by is null and report_id is null`;
  await cleanup(env, DOMAIN);
});

dbTest("Webhook: Löschung bei Didit scheitert → wird beim nächsten Webhook nachgeholt", async () => {
  await cleanup(env, DOMAIN);
  const a = await startFor(`purge1@${DOMAIN}`);
  env.didit.failDelete = true;
  const r1 = await webhook(
    await signed(
      decision(a.sessionId, "Declined", { first_name: "Anna", last_name: "Albers", date_of_birth: "1990-05-17" }),
    ),
  );
  assertEquals((await r1.json()).session_deleted, false);
  env.didit.failDelete = false;
  const b = await startFor(`purge2@${DOMAIN}`);
  await webhook(await signed(decision(b.sessionId, "Expired", {})));
  const [v] = await env
    .sql`select provider_session_deleted_at from app.verifications where provider_session_id = ${a.sessionId}`;
  assert(v!.provider_session_deleted_at !== null, "nachgeholt");
  await cleanup(env, DOMAIN);
});
