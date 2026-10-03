// Datenbank-Test (SUPABASE_DB_URL). Stripe über Ersatz, um die Aufrufe genau zu prüfen.
import { strict as assert } from "node:assert";
import { setStripe } from "../_shared/stripe/client.ts";
import {
  activateMember,
  createMember,
  deleteUsers,
  fakeStripe,
  hasDb,
  request,
  setupEnv,
  signJwt,
  testSql,
  useMemoryMailer,
} from "../_shared/stripe/testing.ts";
import handler from "./handler.ts";

setupEnv();
const opts = { ignore: !hasDb, sanitizeOps: false, sanitizeResources: false };

Deno.test({ name: "billing-cancel: zwei Schritte angemeldet, Stripe zum Periodenende, Eingangsbestätigung mit Datum und Uhrzeit", ...opts, fn: async () => {
  const sql = testSql();
  const mailer = useMemoryMailer();
  const fake = fakeStripe();
  const m = await createMember(sql, { firstName: "Mara", lastName: "Lindholm", freePhaseEnded: true });
  try {
    const c = await activateMember(sql, m.id);
    const token = await signJwt(m.id);
    assert.equal((await handler(request("billing-cancel", { json: { action: "preview" } }))).status, 401);

    // Schritt 1
    const pv = await (await handler(request("billing-cancel", { json: { action: "preview" }, token }))).json();
    assert.equal(pv.possible, true);
    assert.equal(pv.contract_number, c.contractNumber);
    assert.equal(pv.name, "Mara Lindholm");
    assert.equal(pv.buttonLabel, "Jetzt kündigen");
    assert.equal(pv.entryLabel, "Verträge hier kündigen");

    const noReason = await handler(request("billing-cancel", { json: { action: "confirm", kind: "ausserordentlich" }, token }));
    assert.equal(noReason.status, 400);
    assert.equal((await noReason.json()).error, "reason_required");

    // Schritt 2: „Jetzt kündigen“
    const before = Date.now();
    const res = await handler(request("billing-cancel", {
      json: { action: "confirm", kind: "ordentlich", reason: "passt gerade nicht", name: "Mara Lindholm", contactEmail: "mara.kontakt@example.test" },
      token,
    }));
    const r = await res.json();
    assert.equal(res.status, 200, JSON.stringify(r));
    assert.equal(r.stripe, "ok");
    assert.equal(r.confirmationSent, true);
    assert.equal(r.immediate, false);
    assert.ok(new Date(r.receivedAt).getTime() >= before - 2000);

    const call = fake.calls.find((x) => x.method === "POST" && x.path === `/v1/subscriptions/${c.subscriptionId}`)!;
    assert.equal(call.params.get("cancel_at_period_end"), "true");
    assert.ok(call.headers["idempotency-key"]?.startsWith("fermata-cancel-"));

    const mail = mailer.sent.find((x) => x.template === "billing.cancel_confirmation")!;
    assert.equal(mail.to, "mara.kontakt@example.test", "Bestätigung an den angegebenen Kontaktweg");
    assert.match(mail.text, /Eingang Ihrer Kündigung am \d{2}\.\d{2}\.\d{4}, \d{2}:\d{2}:\d{2} Uhr \(MES?Z\)/);
    assert.ok(mail.text.includes(c.contractNumber));

    const [row] = await sql`
      select c.details ->> 'channel' as channel, c.details ->> 'reason' as reason, c.result -> 'stripe' ->> 'status' as stripe,
             c.confirmation_sent_at is not null as sent, m.status
      from billing.contract_actions c join billing.memberships m on m.user_id = c.user_id
      where c.user_id = ${m.id}::uuid and c.kind = 'cancel'`;
    assert.deepEqual({ ...row }, { channel: "angemeldet", reason: "passt gerade nicht", stripe: "ok", sent: true, status: "cancelled" });

    const twice = await handler(request("billing-cancel", { json: { action: "confirm", kind: "ordentlich" }, token }));
    assert.equal(twice.status, 409);
    assert.equal((await twice.json()).error, "already_cancelled");
  } finally {
    setStripe(undefined);
    await deleteUsers(sql, [m.id]);
    await sql.end();
  }
} });

Deno.test({ name: "billing-cancel: Stripe nicht erreichbar → Kündigung gilt trotzdem, Benn bekommt einen Hinweis", ...opts, fn: async () => {
  const sql = testSql();
  useMemoryMailer();
  fakeStripe((_m, path) => path.startsWith("/v1/subscriptions/") ? { status: 500, body: { error: { type: "api_error", message: "weg" } } } : undefined);
  const m = await createMember(sql, { freePhaseEnded: true });
  try {
    await activateMember(sql, m.id, { tier: "auftakt", amountCents: 4900 });
    const res = await handler(request("billing-cancel", { json: { action: "confirm", kind: "ordentlich" }, token: await signJwt(m.id) }));
    const r = await res.json();
    assert.equal(res.status, 200);
    assert.equal(r.stripe, "failed");
    assert.equal(r.confirmationSent, true);
    const [q] = await sql`select count(*)::int as n from safety.mail_queue where to_admin and data ->> 'kind' = 'kuendigung_stripe_fehler'
                          and data ->> 'contract_number' = ${r.contractNumber}`;
    assert.equal(q!.n, 1);
    await sql`delete from safety.mail_queue where to_admin and data ->> 'contract_number' = ${r.contractNumber}`;
  } finally {
    setStripe(undefined);
    await deleteUsers(sql, [m.id]);
    await sql.end();
  }
} });

Deno.test({ name: "billing-cancel: ohne Anmeldung – gleiche Antwort, Link per Mail, Bestätigungsseite, einmal gültig", ...opts, fn: async () => {
  const sql = testSql();
  const mailer = useMemoryMailer();
  const fake = fakeStripe();
  const m = await createMember(sql, { freePhaseEnded: true });
  try {
    const c = await activateMember(sql, m.id);
    const wrong = await handler(request("billing-cancel", {
      json: { action: "request", email: "fremd@example.test", contractNumber: c.contractNumber, kind: "ordentlich" },
    }));
    const right = await handler(request("billing-cancel", {
      json: { action: "request", email: m.email.toUpperCase(), contractNumber: c.contractNumber.toLowerCase(), kind: "ordentlich", name: "Test Person" },
    }));
    assert.equal(wrong.status, 202);
    assert.equal(right.status, 202);
    assert.deepEqual(await wrong.json(), await right.json(), "Antwort verrät nicht, ob es den Vertrag gibt");
    assert.equal(mailer.sent.length, 1);
    const linkMail = mailer.sent[0]!;
    assert.equal(linkMail.template, "billing.cancel_link");
    // Der Link führt in die Web-App; das Kürzel steht hinter # und landet nie in Server-Logs
    const appLink = /https:\/\/app\.fermata\.test\/kuendigen\/bestaetigen#t=[0-9a-f]{64}/.exec(linkMail.text)![0];
    const token = new URL(appLink).hash.slice(3);
    const link = `https://fn.fermata.test/functions/v1/billing-cancel?t=${token}`;

    // Web-App fragt den Link ab (Accept: application/json): führt nichts aus
    const peek = await handler(new Request(link, { headers: { accept: "application/json" } }));
    assert.equal(peek.status, 200);
    const info = await peek.json();
    assert.equal(info.valid, true);
    assert.equal(info.kind, "cancel");
    assert.equal(info.contract_number, c.contractNumber);
    assert.ok(info.requested_at && info.expires_at);
    const bad = await handler(new Request(link.replace(/t=[0-9a-f]+/, "t=" + "0".repeat(64)), { headers: { accept: "application/json" } }));
    assert.equal(bad.status, 404);
    assert.deepEqual(await bad.json(), { valid: false, error: "invalid_link" });

    // Ohne JSON bleibt die schlichte Seite (z. B. Vorschau durch das Mailprogramm): führt nichts aus
    const page = await handler(new Request(link));
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.ok(html.includes(c.contractNumber) && html.includes("Kündigung bestätigen") && html.includes('method="post"'));
    assert.match(page.headers.get("content-security-policy") ?? "", /default-src 'none'/);
    assert.equal(fake.calls.length, 0);

    // Knopf auf der Seite
    const confirm = await handler(new Request(link, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ action: "confirm_link", t: token }),
    }));
    assert.equal(confirm.status, 200);
    assert.ok((await confirm.text()).includes("Ihre Kündigung ist eingegangen"));
    assert.ok(fake.calls.some((x) => x.path === `/v1/subscriptions/${c.subscriptionId}`));
    const [row] = await sql`
      select c.details ->> 'channel' as channel, (c.details ->> 'received_at')::timestamptz = r.requested_at as received_is_form_time
      from billing.contract_actions c join billing.contract_requests r on r.contract_action_id = c.id
      where c.user_id = ${m.id}::uuid and c.kind = 'cancel'`;
    assert.equal(row!.channel, "ohne_anmeldung");
    assert.equal(row!.received_is_form_time, true, "Eingang = Zeitpunkt des Formulars");
    assert.ok(mailer.sent.some((x) => x.template === "billing.cancel_confirmation" && x.to === m.email));

    const again = await handler(new Request(link, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ action: "confirm_link", t: token }),
    }));
    assert.equal(again.status, 404);
  } finally {
    setStripe(undefined);
    await deleteUsers(sql, [m.id]);
    await sql.end();
  }
} });
