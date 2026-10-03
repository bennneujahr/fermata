import { assert, assertEquals } from "@std/assert";
import { cleanup, createMember, dbTest, onboard, req, setupWebTests } from "../_shared/web_test_utils.ts";
import handler from "./handler.ts";

const env = setupWebTests();
const DOMAIN = "delete.deno.test";

dbTest("account-delete: Bestätigung nötig", async () => {
  await cleanup(env, DOMAIN);
  const m = await createMember(env, `nein@${DOMAIN}`);
  assertEquals((await handler(req("account-delete", { body: {} }))).status, 401);
  const res = await handler(req("account-delete", { token: m.token, body: { confirm: "ja" } }));
  assertEquals(res.status, 422);
  assertEquals((await res.json()).error, "confirmation_required");
  const [u] = await env.sql`select count(*)::int as n from auth.users where id = ${m.id}::uuid`;
  assertEquals(u!.n, 1);
  await cleanup(env, DOMAIN);
});

dbTest("account-delete: löscht alles, behält gesetzliche Reste ohne Personenbezug, schickt Bestätigung", async () => {
  await cleanup(env, DOMAIN);
  const m = await createMember(env, `weg@${DOMAIN}`);
  await onboard(env, m.id, { first: "Wera", last: "Weg", birth: "1990-01-01" });
  await env.sql`select api.save_address_form('du') from (select set_config('request.jwt.claims', ${
    JSON.stringify({ sub: m.id, role: "authenticated" })
  }, true)) x`;
  await env
    .sql`insert into billing.contract_actions (user_id, kind, details) values (${m.id}::uuid, 'order', '{"probe": "delete-test"}')`;
  const res = await handler(req("account-delete", { token: m.token, body: { confirm: true } }));
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { deleted: true, mail_sent: true });
  for (
    const t of [
      "app.accounts",
      "private.account_facts",
      "app.consents",
      "app.geo",
      "billing.memberships",
      "billing.evening_ledger",
    ]
  ) {
    const [r] = await env.sql.unsafe(`select count(*)::int as n from ${t} where user_id = $1::uuid`, [m.id]);
    assertEquals(r!.n, 0, `${t} geleert`);
  }
  const [ca] = await env
    .sql`select count(*)::int as n from billing.contract_actions where user_id is null and details->>'probe' = 'delete-test'`;
  assertEquals(ca!.n, 1, "Vertragshandlung bleibt ohne Personenbezug");
  await env.sql`delete from billing.contract_actions where details->>'probe' = 'delete-test'`;
  const mail = env.mailer.sent.at(-1)!;
  assertEquals(mail.to, `weg@${DOMAIN}`);
  assertEquals(mail.template, "account.deleted");
  assertEquals(mail.subject, "Dein Konto ist gelöscht");
  assert(mail.text.includes("Hallo Wera"));
  const audit = await env
    .sql`select action from ops.audit_log where target_id = ${m.id} and action like 'account.%' order by id`;
  assertEquals(audit.map((a) => a.action).filter((a) => a.startsWith("account.delet")), [
    "account.deletion_requested",
    "account.deleted",
  ]);
  assert(env.authCalls.some((c) => c.method === "DELETE" && c.path === `/auth/v1/admin/users/${m.id}`));
  await cleanup(env, DOMAIN);
});
