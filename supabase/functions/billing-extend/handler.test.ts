// Datenbank-Test (SUPABASE_DB_URL): Verlängerungsregel, Stripe-Seite über trial_end.
import { strict as assert } from "node:assert";
import { setStripe, unix } from "../_shared/stripe/client.ts";
import {
  activateMember,
  createMember,
  deleteUsers,
  fakeStripe,
  hasDb,
  INTERNAL_SECRET,
  setupEnv,
  testSql,
  useMemoryMailer,
} from "../_shared/stripe/testing.ts";
import handler from "./handler.ts";

setupEnv();
const opts = { ignore: !hasDb, sanitizeOps: false, sanitizeResources: false };

Deno.test({ name: "billing-extend: verschiebt das Abrechnungsdatum per trial_end und schickt einen Hinweis", ...opts, fn: async () => {
  const sql = testSql();
  const mailer = useMemoryMailer();
  const fake = fakeStripe();
  const m = await createMember(sql, { freePhaseEnded: true, freeGrant: 0 });
  try {
    assert.equal((await handler(new Request("https://fn.fermata.test/functions/v1/billing-extend", { method: "POST" }))).status, 401);
    const c = await activateMember(sql, m.id, { tier: "andante" });
    // Zeitraum so legen, dass er in 2 Stunden endet (im Prüffenster) und ohne Abend war.
    await sql`update billing.membership_periods set starts_at = now() - interval '28 days' + interval '2 hours',
              ends_at = now() + interval '2 hours' where user_id = ${m.id}::uuid`;
    const res = await handler(new Request("https://fn.fermata.test/functions/v1/billing-extend", {
      method: "POST", headers: { "x-fermata-internal-secret": INTERNAL_SECRET, "content-type": "application/json" }, body: "{}",
    }));
    const r = await res.json();
    assert.equal(res.status, 200, JSON.stringify(r));
    const mine = r.results.find((x: { periodId: string }) => x.periodId);
    assert.ok(r.extended >= 1 && mine.synced && mine.notified);

    const [p] = await sql`select extended_until, stripe_sync_status, extension_notified_at is not null as notified
                          from billing.membership_periods where user_id = ${m.id}::uuid`;
    assert.equal(p!.stripe_sync_status, "synced");
    assert.equal(p!.notified, true);
    const call = fake.calls.find((x) => x.path === `/v1/subscriptions/${c.subscriptionId}`)!;
    assert.equal(call.params.get("trial_end"), String(unix(p!.extended_until)));
    assert.equal(call.params.get("proration_behavior"), "none");
    assert.ok(mailer.sent.some((x) => x.template === "billing.extended" && x.to === m.email));

    // Zweiter Lauf: nichts mehr zu tun
    const again = await (await handler(new Request("https://fn.fermata.test/functions/v1/billing-extend", {
      method: "POST", headers: { "x-fermata-internal-secret": INTERNAL_SECRET },
    }))).json();
    assert.equal(again.results.filter((x: { periodId: string }) => x.periodId === mine.periodId).length, 0);
  } finally {
    setStripe(undefined);
    await deleteUsers(sql, [m.id]);
    await sql.end();
  }
} });
