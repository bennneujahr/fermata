import { assert, assertEquals } from "@std/assert";
import { setStripe } from "../_shared/stripe/client.ts";
import { cleanupEvenings, createEvening, fakeStripe } from "../_shared/stripe/testing.ts";
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
  assertEquals(await res.json(), { deleted: true, mail_sent: true, evenings_cancelled: 0, subscription_cancelled: null });
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

dbTest("account-delete: sagt offene Abende ab, Gegenüber bekommt die Nachricht trotz Löschung, Stripe-Abo endet sofort", async () => {
  await cleanup(env, DOMAIN);
  const stripeFake = fakeStripe();
  const a = await createMember(env, `abo@${DOMAIN}`);
  const b = await createMember(env, `gegenueber@${DOMAIN}`);
  let leftovers: { run_id: string; venue_id: string }[] = [];
  try {
    const confirmed = await createEvening(env.sql, a.id, b.id, { startsInHours: 72, state: "confirmed", venueName: "Weinstube Löschtest" });
    const proposal = await createEvening(env.sql, a.id, b.id, { startsInHours: 120, state: "proposed" });
    await env.sql`update billing.memberships set tier = 'andante', status = 'active', contract_number = 'FM-DELE-TEST',
                  stripe_customer_id = 'cus_del', stripe_subscription_id = 'sub_del_123' where user_id = ${a.id}::uuid`;
    leftovers = await env.sql`select distinct p.run_id, e.venue_id from app.evenings e join app.pairings p on p.id = e.pairing_id
                              where e.id in (${confirmed}::uuid, ${proposal}::uuid)`;

    const res = await handler(req("account-delete", { token: a.token, body: { confirm: true } }));
    assertEquals(res.status, 200);
    assertEquals(await res.json(), { deleted: true, mail_sent: true, evenings_cancelled: 2, subscription_cancelled: true });

    // Stripe: Abo sofort beendet
    const del = stripeFake.calls.filter((c) => c.method === "DELETE");
    assertEquals(del.map((c) => c.path), ["/v1/subscriptions/sub_del_123"]);
    // Kündigung „konto_geloescht“ bleibt als Nachweis ohne Personenbezug (ohne Name und E-Mail)
    const [ca] = await env.sql`select user_id, details, result from billing.contract_actions
                               where kind = 'cancel' and details ->> 'stripe_subscription_id' = 'sub_del_123'`;
    assertEquals(ca!.user_id, null);
    assertEquals(ca!.details.reason, "konto_geloescht");
    assertEquals(ca!.details.contract_number, "FM-DELE-TEST");
    assert(!("name" in ca!.details) && !("contact_email" in ca!.details), "keine Namen oder Adressen im Nachweis");
    assertEquals(ca!.result.stripe, "canceled");

    // Abende sind mit dem Konto weg, die Nachrichten an das Gegenüber nicht (Inhalt festgehalten, Bezug gelöst)
    const [ev] = await env.sql`select count(*)::int as n from app.evenings where id in (${confirmed}::uuid, ${proposal}::uuid)`;
    assertEquals(ev!.n, 0);
    const queued = await env.sql`select template, evening_id, payload from ops.notification_queue
                                 where user_id = ${b.id}::uuid and template in ('evening.cancelled', 'evening.declined')
                                   and sent_at is null order by template`;
    assertEquals(queued.map((q) => q.template), ["evening.cancelled", "evening.declined"]);
    for (const q of queued) {
      assertEquals(q.evening_id, null);
      assert(q.payload.snapshot?.evening, "Inhalt festgehalten");
    }
    const cancelled = queued.find((q) => q.template === "evening.cancelled")!;
    assertEquals(cancelled.payload.by, "fermata", "neutral: Fermata sagt ab, kein Grund");
    assertEquals(cancelled.payload.snapshot.evening.venue.name, "Weinstube Löschtest");
    const [own] = await env.sql`select count(*)::int as n from ops.notification_queue where user_id = ${a.id}::uuid`;
    assertEquals(own!.n, 0, "keine Nachrichten an die gelöschte Person");
    // Versand: Kontext kommt aus dem festgehaltenen Stand
    const [ctx] = await env.sql`select ops.notification_context(q.id) as c from ops.notification_queue q
                                where q.user_id = ${b.id}::uuid and q.template = 'evening.cancelled' and q.sent_at is null`;
    assertEquals(ctx!.c.recipient.email, `gegenueber@${DOMAIN}`);
    assertEquals(ctx!.c.evening.venue.name, "Weinstube Löschtest");
    // Gegenüber hat seinen Abend zurück (Kontingent)
    const [avail] = await env.sql`select billing.available_evenings(${b.id}::uuid) as n`;
    assertEquals(avail!.n, 1);
  } finally {
    setStripe(undefined);
    await env.sql`delete from billing.contract_actions where details ->> 'stripe_subscription_id' = 'sub_del_123'`;
    await env.sql`delete from ops.notification_queue where user_id = ${b.id}::uuid`;
    await cleanupEvenings(env.sql, [a.id, b.id]);
    for (const l of leftovers) {
      await env.sql`delete from app.match_runs where id = ${l.run_id}::uuid and not exists (select 1 from app.pairings where run_id = ${l.run_id}::uuid)`;
      await env.sql`delete from app.venues where id = ${l.venue_id}::uuid and not exists (select 1 from app.evenings where venue_id = ${l.venue_id}::uuid)`;
    }
    await cleanup(env, DOMAIN);
  }
});

dbTest("account-delete: Stripe-Fehler hält die Löschung nicht auf, Benn bekommt einen Hinweis", async () => {
  await cleanup(env, DOMAIN);
  const stripeFake = fakeStripe((method) => method === "DELETE" ? { status: 500, body: { error: { type: "api_error", message: "kaputt" } } } : undefined);
  const a = await createMember(env, `stripekaputt@${DOMAIN}`);
  try {
    await env.sql`update billing.memberships set tier = 'auftakt', status = 'past_due', contract_number = 'FM-KAPU-TTXX',
                  stripe_customer_id = 'cus_err', stripe_subscription_id = 'sub_err_456' where user_id = ${a.id}::uuid`;
    const res = await handler(req("account-delete", { token: a.token, body: { confirm: true } }));
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.deleted, true);
    assertEquals(body.subscription_cancelled, false);
    assert(stripeFake.calls.some((c) => c.method === "DELETE" && c.path === "/v1/subscriptions/sub_err_456"));
    const [u] = await env.sql`select count(*)::int as n from auth.users where id = ${a.id}::uuid`;
    assertEquals(u!.n, 0, "personenbezogene Daten trotzdem gelöscht");
    const [flag] = await env.sql`select severity, details from safety.safety_flags
                                 where kind = 'stripe_kuendigung_bei_kontoloeschung_fehlgeschlagen'
                                   and details ->> 'stripe_subscription_id' = 'sub_err_456'`;
    assertEquals(flag!.severity, "hoch");
    assertEquals(flag!.details.contract_number, "FM-KAPU-TTXX");
    const [ca] = await env.sql`select result from billing.contract_actions where details ->> 'stripe_subscription_id' = 'sub_err_456'`;
    assertEquals(ca!.result.stripe, "failed");
    const [audit] = await env.sql`select count(*)::int as n from ops.audit_log where action = 'account.stripe_cancel_failed'
                                  and target_id = (select id::text from billing.contract_actions where details ->> 'stripe_subscription_id' = 'sub_err_456')`;
    assertEquals(audit!.n, 1);
  } finally {
    setStripe(undefined);
    await env.sql`delete from safety.mail_queue where to_admin and data ->> 'stripe_subscription_id' = 'sub_err_456'`;
    await env.sql`delete from safety.safety_flags where details ->> 'stripe_subscription_id' = 'sub_err_456'`;
    await env.sql`delete from billing.contract_actions where details ->> 'stripe_subscription_id' = 'sub_err_456'`;
    await cleanup(env, DOMAIN);
  }
});
