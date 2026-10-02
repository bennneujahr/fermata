import { assert, assertEquals, assertMatch } from "@std/assert";
import { sha256Hex } from "../_shared/crypto.ts";
import { setMailer } from "../_shared/mail/mod.ts";
import handler from "./handler.ts";
import { dbTest, FUNCTIONS, post, reset, setSetting, setup, signupBody, teardown } from "./test_utils.ts";

const { sql, mailer } = setup();

dbTest("Preflight: CORS nur für erlaubte Herkunft", async () => {
  const ok = await handler(new Request("http://localhost/x", { method: "OPTIONS", headers: { origin: "https://fermata.test" } }));
  assertEquals(ok.status, 204);
  assertEquals(ok.headers.get("access-control-allow-origin"), "https://fermata.test");
  const other = await handler(new Request("http://localhost/x", { method: "OPTIONS", headers: { origin: "https://evil.example" } }));
  assertEquals(other.headers.get("access-control-allow-origin"), null);
  const get = await handler(new Request("http://localhost/x"));
  assertEquals(get.status, 405);
});

dbTest("Ungültiges JSON und leere Felder", async () => {
  await reset(sql, mailer);
  assertEquals((await handler(post("waitlist-signup", "{kaputt"))).status, 400);
  const res = await handler(post("waitlist-signup", { fill_ms: 5000 }));
  assertEquals(res.status, 422);
  assertEquals(await res.json(), {
    error: "validation",
    fields: { first_name: "required", email: "required", region: "required", postal_code: "required", consent: "required" },
  });
  const bad = await handler(post("waitlist-signup", signupBody({ email: "anna@", postal_code: "1905", region: "mars", first_name: "www.spam.example/x" })));
  assertEquals((await bad.json()).fields, { first_name: "invalid", email: "invalid", region: "invalid", postal_code: "invalid" });
  assertEquals(mailer.sent.length, 0);
});

dbTest("Honigtopf: neutrale Antwort, aber kein Eintrag", async () => {
  await reset(sql, mailer);
  const res = await handler(post("waitlist-signup", signupBody({ website: "https://spam.example" })));
  assertEquals(res.status, 202);
  assertEquals(await res.json(), { ok: true });
  assertEquals((await sql`select count(*)::int as n from public.waitlist`)[0]!.n, 0);
  assertEquals(mailer.sent.length, 0);
});

dbTest("Mindestzeit: zu schnelles Absenden wird abgelehnt", async () => {
  await reset(sql, mailer);
  const res = await handler(post("waitlist-signup", signupBody({ fill_ms: 900 })));
  assertEquals(res.status, 400);
  assertEquals(await res.json(), { error: "too_fast" });
  const missing = await handler(post("waitlist-signup", signupBody({ fill_ms: undefined })));
  assertEquals(missing.status, 400);
  assertEquals((await sql`select count(*)::int as n from public.waitlist`)[0]!.n, 0);
});

dbTest("Anmeldung: Bestätigungs-Mail, nur Hash gespeichert, gleiche Antwort beim zweiten Mal", async () => {
  await reset(sql, mailer);
  const first = await handler(post("waitlist-signup", signupBody({ email: " Anna@Example.org ", source: "pfaffenteich" })));
  assertEquals(first.status, 202);
  const firstBody = await first.text();
  assertEquals(mailer.sent.length, 1);
  const mail = mailer.sent[0]!;
  assertEquals(mail.to, "anna@example.org");
  assertEquals(mail.template, "waitlist.confirm");
  assertEquals(mail.subject, "Bitte bestätigen Sie Ihre Anmeldung bei Fermata");
  const m = new RegExp(`${FUNCTIONS.replace(/[/.]/g, "\\$&")}/waitlist-confirm\\?t=([A-Za-z0-9_-]{43})`).exec(mail.text);
  assert(m, "Bestätigungslink fehlt");
  const [row] = await sql`select confirm_token_hash, source, first_name from public.waitlist where email = 'anna@example.org'`;
  assertEquals(row!.confirm_token_hash, await sha256Hex(m[1]!));
  assertEquals(row!.source, "pfaffenteich");
  assert(!mail.text.includes("pfaffenteich"), "Keine Werbung oder Quelle in der Bestätigungs-Mail");
  assertMatch(mail.text, /Guten Tag, Anna,/);

  const again = await handler(post("waitlist-signup", signupBody()));
  assertEquals(again.status, 202);
  assertEquals(await again.text(), firstBody, "Antwort ist für bekannte Adressen identisch");
  assertEquals(mailer.sent.length, 1, "Innerhalb der Pause keine zweite Mail");
});

dbTest("Drossel: zu viele Versuche je IP", async () => {
  await reset(sql, mailer);
  await setSetting(sql, "waitlist.rate_limit_per_hour", 2);
  const ip = { "x-forwarded-for": "192.0.2.10, 10.0.0.1" };
  assertEquals((await handler(post("waitlist-signup", signupBody({ email: "a1@example.org" }), ip))).status, 202);
  assertEquals((await handler(post("waitlist-signup", signupBody({ email: "a2@example.org" }), ip))).status, 202);
  const third = await handler(post("waitlist-signup", signupBody({ email: "a3@example.org" }), ip));
  assertEquals(third.status, 429);
  assertEquals(await third.json(), { error: "throttled" });
  const other = await handler(post("waitlist-signup", signupBody({ email: "a4@example.org" }), { "x-forwarded-for": "192.0.2.11" }));
  assertEquals(other.status, 202);
  await setSetting(sql, "waitlist.rate_limit_per_hour", 1000);
});

dbTest("Veralteter Einwilligungstext wird gemeldet", async () => {
  await reset(sql, mailer);
  const res = await handler(post("waitlist-signup", signupBody({ consent_version: "alt" })));
  assertEquals(res.status, 422);
  assertEquals((await res.json()).fields, { consent: "invalid" });
});

dbTest("Versand schlägt fehl: 503, danach sofort neuer Versuch möglich", async () => {
  await reset(sql, mailer);
  setMailer({ name: "kaputt", send: () => Promise.reject(new Error("Brevo nicht erreichbar")) });
  const failed = await handler(post("waitlist-signup", signupBody()));
  assertEquals(failed.status, 503);
  assertEquals((await failed.json()).error, "mail_failed");
  setMailer(mailer);
  const retry = await handler(post("waitlist-signup", signupBody()));
  assertEquals(retry.status, 202);
  assertEquals(mailer.sent.length, 1);
});

dbTest("Aufräumen", () => teardown(sql, mailer));
