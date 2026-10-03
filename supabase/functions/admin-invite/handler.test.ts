import { assert, assertEquals } from "@std/assert";
import { cleanup, createMember, dbTest, fakeJwt, req, setupWebTests } from "../_shared/web_test_utils.ts";
import handler from "./handler.ts";

const env = setupWebTests();
const DOMAIN = "invite.deno.test";

async function admin(aal: "aal1" | "aal2") {
  const [row] = await env.sql`
    insert into auth.users (id, email, aud, role, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    values (gen_random_uuid(), ${`admin-${aal}@${DOMAIN}`}, 'authenticated', 'authenticated', now(), now(), '{}', '{}') returning id`;
  const id = row!.id as string;
  await env.sql`insert into app.admin_users (user_id, display_name) values (${id}::uuid, 'Test-Admin')`;
  const token = fakeJwt(id, aal);
  env.users.set(token, { id, email: `admin-${aal}@${DOMAIN}` });
  return { id, token };
}

dbTest("admin-invite: nur Admins mit Zwei-Faktor", async () => {
  await cleanup(env, DOMAIN);
  const a1 = await admin("aal1");
  const r1 = await handler(req("admin-invite", { token: a1.token, body: { email: `neu@${DOMAIN}` } }));
  assertEquals(r1.status, 403);
  const member = await createMember(env, `mitglied@${DOMAIN}`, "aal2");
  const r2 = await handler(req("admin-invite", { token: member.token, body: { email: `neu@${DOMAIN}` } }));
  assertEquals(r2.status, 403);
  const [u] = await env.sql`select count(*)::int as n from auth.users where email = ${`neu@${DOMAIN}`}`;
  assertEquals(u!.n, 0);
  await cleanup(env, DOMAIN);
});

dbTest("admin-invite: legt Konto, Mitgliedschaft und Gratis-Abend an und schickt die Einladung", async () => {
  await cleanup(env, DOMAIN);
  const a = await admin("aal2");
  const bad = await handler(req("admin-invite", { token: a.token, body: { email: "kein-mail" } }));
  assertEquals(bad.status, 422);

  const res = await handler(req("admin-invite", { token: a.token, body: { email: ` Neu@${DOMAIN} ` } }));
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.invited, true);
  assertEquals(body.mail_sent, true);
  const [acc] = await env.sql`select a.status, m.status as membership, billing.available_evenings(a.user_id) as evenings
    from app.accounts a join billing.memberships m using (user_id) join auth.users u on u.id = a.user_id where u.email = ${`neu@${DOMAIN}`}`;
  assertEquals(acc, { status: "onboarding", membership: "free", evenings: 1 });
  const mail = env.mailer.sent.at(-1)!;
  assertEquals(mail.to, `neu@${DOMAIN}`);
  assertEquals(mail.template, "account.invite");
  assert(mail.text.includes("http://localhost:3041/anmelden"));
  assert(!mail.text.includes("!"), "ruhiger Ton");

  // Erneut einladen (z. B. Mail verloren): gleiche Person, neue Einladung
  const again = await handler(req("admin-invite", { token: a.token, body: { email: `neu@${DOMAIN}` } }));
  assertEquals(again.status, 200);
  assertEquals((await again.json()).user_id, body.user_id);
  const [inv] = await env.sql`select count(*)::int as n from app.account_invitations where email = ${`neu@${DOMAIN}`} and revoked_at is null`;
  assertEquals(inv!.n, 1);

  // Schon Mitglied (Einladung angenommen) → 409
  await env.sql`update auth.users set last_sign_in_at = now() where id = ${body.user_id}::uuid`;
  const member = await handler(req("admin-invite", { token: a.token, body: { email: `neu@${DOMAIN}` } }));
  assertEquals(member.status, 409);
  assertEquals((await member.json()).error, "already_member");
  await env.sql`delete from app.admin_users where user_id = ${a.id}::uuid`;
  await cleanup(env, DOMAIN);
});
