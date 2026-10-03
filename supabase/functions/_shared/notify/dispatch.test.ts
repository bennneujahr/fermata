// Tests für den Versand: Vorlagen (Sie/Du, keine Namen im Push), notify-dispatch mit MemoryMailer und einem
// nachgebauten Push-Dienst (Zustellung, 410 → Abo entfernen, Fehler), Bestätigungslink fürs Lokal, Handler.
import { assert, assertEquals, assertMatch, assertStringIncludes } from "@std/assert";
import { MemoryMailer } from "../mail/outbox.ts";
import type { MailMessage } from "../mail/types.ts";
import { knownTemplates, renderNotification } from "../mail/templates/notify.ts";
import { b64uEncode, decryptPushPayload, generateVapidKeys, importVapid, type PushTarget, WebPushSender } from "../push/mod.ts";
import { dispatchDue, type DispatchDeps, type NotifyStore } from "./dispatch.ts";
import type { ChannelResult, ClaimedNotification, NotificationContext } from "./types.ts";
import { signVenueToken, verifyVenueToken } from "./venue-token.ts";
import dispatchHandler, { setDispatchDeps } from "../../notify-dispatch/handler.ts";
import venueConfirm, { setVenueStore } from "../../venue-confirm/handler.ts";
import pushKey from "../../push-key/handler.ts";

const EVENING_ID = "30000000-0000-0000-0000-000000000001";
const RES_ID = "40000000-0000-0000-0000-000000000001";

function memberCtx(template: string, form: "sie" | "du", extra: Partial<NotificationContext> = {}): NotificationContext {
  return {
    id: 1,
    template,
    payload: { evening_id: EVENING_ID, hours_before: 2, late: true, minutes: 10, respond_until: "2026-10-10T07:00:00Z",
      deadline_at: "2026-10-08T17:00:00Z", offer_until: "2026-10-16T17:30:00Z" },
    is_safety: template === "evening.checkin",
    has_deadline: true,
    recipient: { kind: "member", email: "anna@example.test", name: "Anna", address_form: form },
    evening: {
      id: EVENING_ID,
      state: "confirmed",
      starts_at: "2026-10-09T17:30:00Z",
      ends_at: "2026-10-09T19:30:00Z",
      venue: {
        name: "Café am See",
        street: "Seestraße 1",
        postal_code: "19053",
        city: "Schwerin",
        public_transport: "Bus 10, Haltestelle Markt",
        accessibility: "Stufenloser Eingang",
        description: null,
      },
      reasons_text: "Sie gehen beide gern am Wasser spazieren.",
      offered_times: ["2026-10-09T17:00:00Z", "2026-10-09T17:30:00Z", "2026-10-10T17:00:00Z"],
      deadline_at: "2026-10-08T21:00:00Z",
      reservation_name: "Fermata",
      table_code: "K7QX",
      late_cancel_from: "2026-10-08T17:30:00Z",
      late_cancel_hours: 24,
      find_before_minutes: 15,
      feedback_until: "2026-10-16T17:30:00Z",
    },
    safety: { emergency_number: "110", heimwegtelefon_number: "030 12074182", heimwegtelefon_hours: "So–Do 21–01 Uhr, Fr/Sa 21–03 Uhr" },
    period: { id: "51000000-0000-0000-0000-000000000001", starts_on: "2026-10-14", ends_on: "2026-10-27", answer_until: "2026-10-07T08:05:00Z" },
    ...extra,
  };
}

function venueCtx(template: string, kind: "venue" | "admin" = "venue"): NotificationContext {
  return {
    id: 2,
    template,
    payload: { reservation_id: RES_ID },
    is_safety: false,
    has_deadline: false,
    recipient: { kind, email: kind === "venue" ? "tisch@cafe.example" : "benn@fermata.example", name: kind === "venue" ? "Frau Wirt" : null,
      address_form: kind === "venue" ? "sie" : "du" },
    reservation: {
      id: RES_ID,
      starts_at: "2026-10-09T17:30:00Z",
      table_code: "K7QX",
      persons: 2,
      reservation_name: "Fermata",
      status: "reserved",
      venue_confirmed_at: null,
      notes: "Bitte ein ruhiger Tisch",
      token_expires_at: "2026-10-10T17:30:00Z",
      venue: { name: "Café am See", street: "Seestraße 1", postal_code: "19053", city: "Schwerin", contact_name: "Frau Wirt",
        contact_phone: kind === "admin" ? "0385 123456" : null, reservation_mode: kind === "venue" ? "email" : "telefon" },
    },
  };
}

const opts = { appUrl: "https://app.fermata.example" };

Deno.test("Vorlagen: jede Kennung liefert Mail und (außer Lokal/Admin/Quittung) Push, in Sie- und Du-Form", () => {
  for (const template of knownTemplates) {
    for (const form of ["sie", "du"] as const) {
      const isVenue = template.startsWith("venue.") || template.startsWith("admin.");
      const ctx = isVenue ? venueCtx(template) : memberCtx(template, form);
      const r = renderNotification(ctx, opts);
      assert(r.mail, `Mail fehlt: ${template}`);
      assert(r.mail.subject.length > 5, template);
      assertEquals(r.mail.template, template);
      assert(!/!/.test(r.mail.text.replace("<!doctype", "")), `Ausrufezeichen in ${template}`);
      assert(!r.mail.text.includes("undefined") && !r.mail.text.includes("null"), `Platzhalter offen in ${template}: ${r.mail.text}`);
      if (!isVenue && template !== "evening.cancel_receipt") {
        assert(r.push, `Push fehlt: ${template}`);
        assertEquals(r.push.title, "Fermata");
        assert(r.push.body.length <= 120, `Push zu lang: ${template}`);
        assert(!r.push.body.includes("Anna") && !r.push.body.includes("Café"), `Push nennt Namen: ${template}`);
        assert(r.push.url.startsWith("/"), template);
      }
    }
  }
});

Deno.test("Vorschlag: Lokal, warum Sie beide, drei Zeiten, Frist; Du-Form duzt", () => {
  const sie = renderNotification(memberCtx("evening.proposed", "sie"), opts).mail!;
  assertEquals(sie.subject, "Vorschlag für einen Abend");
  assertStringIncludes(sie.text, "Guten Tag, Anna,");
  assertStringIncludes(sie.text, "Warum Sie beide: Sie gehen beide gern am Wasser spazieren.");
  assertStringIncludes(sie.text, "Café am See, Seestraße 1, 19053 Schwerin");
  assertStringIncludes(sie.text, "– Freitag, 9. Oktober, 19:00 Uhr");
  assertStringIncludes(sie.text, "– Samstag, 10. Oktober, 19:00 Uhr");
  assertStringIncludes(sie.text, "Bitte antworten Sie bis Donnerstag, 8. Oktober, 23:00 Uhr.");
  assertStringIncludes(sie.text, "https://app.fermata.example/abende/" + EVENING_ID);
  const du = renderNotification(memberCtx("evening.proposed", "du"), opts).mail!;
  assertStringIncludes(du.text, "Hallo Anna,");
  assertStringIncludes(du.text, "für dich");
  assertStringIncludes(du.text, "Warum ihr beide:");
  assert(!du.text.replace("Sie gehen beide gern am Wasser spazieren.", "").includes(" Sie "), "Du-Form ohne Sie (außer im zitierten Grund)");
});

Deno.test("Check-in nennt Notruf und Heimwegtelefon; Push ist eine Sicherheitsnachricht ohne Namen", () => {
  const r = renderNotification(memberCtx("evening.checkin", "sie"), opts);
  assertStringIncludes(r.mail!.text, "Notruf 110");
  assertStringIncludes(r.mail!.text, "030 12074182");
  assertEquals(r.push!.safety, true);
  assertEquals(r.push!.url, `/abende/${EVENING_ID}/check-in`);
});

Deno.test("Erinnerung: heute oder morgen je nach Stunden vorher", () => {
  const two = renderNotification(memberCtx("evening.reminder", "sie"), opts);
  assertMatch(two.mail!.subject, /^Heute um 19:30 Uhr/);
  const day = renderNotification(memberCtx("evening.reminder", "sie", { payload: { hours_before: 24 } }), opts);
  assertMatch(day.mail!.subject, /^Morgen um 19:30 Uhr/);
});

Deno.test("Rückmeldung nötig: neutral, verrät nichts über die Angaben des Gegenübers", () => {
  const r = renderNotification(memberCtx("evening.feedback_needed", "sie"), opts);
  assert(!/nicht (da|erschienen)|gemeldet/i.test(r.mail!.text));
  assertStringIncludes(r.mail!.text, "Samstag, 10. Oktober, 09:00 Uhr");
});

Deno.test("Lokal: Reservierung mit Code und Personen, ohne Mitgliederdaten; Admin bekommt Telefon", () => {
  const r = renderNotification(venueCtx("venue.reservation"), { ...opts, venueConfirmUrl: "https://x.example/venue-confirm?t=abc" });
  assertMatch(r.mail!.subject, /Reservierung für 2 Personen am Freitag, 9\. Oktober, 19:30 Uhr \(Fermata K7QX\)/);
  assertStringIncludes(r.mail!.text, "Tisch-Code: K7QX");
  assertStringIncludes(r.mail!.text, "Personen: 2");
  assertStringIncludes(r.mail!.text, "Hinweis: Bitte ein ruhiger Tisch");
  assertStringIncludes(r.mail!.text, "Reservierung bestätigen: https://x.example/venue-confirm?t=abc");
  assertEquals(r.push, null);
  const admin = renderNotification(venueCtx("venue.reservation", "admin"), opts);
  assertMatch(admin.mail!.subject, /^Bitte telefonisch reservieren/);
  assertStringIncludes(admin.mail!.text, "0385 123456");
  const cancel = renderNotification(venueCtx("venue.cancellation"), opts);
  assertStringIncludes(cancel.mail!.text, "Bitte geben Sie den Tisch frei.");
});

Deno.test("Unbekannte Vorlage oder fehlende Daten: nichts", () => {
  assertEquals(renderNotification(memberCtx("test.ping", "sie"), opts), { mail: null, push: null });
  assertEquals(renderNotification(memberCtx("evening.proposed", "sie", { evening: undefined }), opts), { mail: null, push: null });
});

Deno.test("Bestätigungslink: signieren, prüfen, manipuliert, abgelaufen", async () => {
  const exp = new Date(Date.now() + 3600_000);
  const token = await signVenueToken("geheim", RES_ID, exp);
  assertEquals(await verifyVenueToken("geheim", token), RES_ID);
  assertEquals(await verifyVenueToken("anderes", token), null);
  assertEquals(await verifyVenueToken("geheim", token.replace(RES_ID, "40000000-0000-0000-0000-000000000002")), null);
  assertEquals(await verifyVenueToken("geheim", token, exp.getTime() + 1000), null);
  assertEquals(await verifyVenueToken("geheim", "kaputt"), null);
});

// ---------------------------------------------------------------------------
// Versand mit Attrappen
// ---------------------------------------------------------------------------
class FakeStore implements NotifyStore {
  completed: { id: number; email: ChannelResult | null; push: ChannelResult | null; error: string | null }[] = [];
  pushResults: { endpoint: string; status: number }[] = [];
  logs: { template: string; status: string; host: string }[] = [];
  constructor(private queue: ClaimedNotification[]) {}
  claim(limit: number) {
    return Promise.resolve(this.queue.splice(0, limit));
  }
  complete(id: number, email: ChannelResult | null, push: ChannelResult | null, error: string | null) {
    this.completed.push({ id, email, push, error });
    return Promise.resolve("sent");
  }
  pushResult(endpoint: string, status: number) {
    this.pushResults.push({ endpoint, status });
    return Promise.resolve();
  }
  logPush(_u: string | null, template: string, status: "sent" | "failed", host: string) {
    this.logs.push({ template, status, host });
    return Promise.resolve();
  }
  pushTtlSeconds() {
    return Promise.resolve(86400);
  }
}

async function browserSubscription() {
  const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]) as CryptoKeyPair;
  const publicKey = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const auth = crypto.getRandomValues(new Uint8Array(16));
  return { publicKey, privateKey: pair.privateKey, auth };
}

async function fakePushService() {
  const sub = await browserSubscription();
  const received: unknown[] = [];
  const server = Deno.serve({ port: 0, hostname: "127.0.0.1", onListen: () => {} }, async (req) => {
    const path = new URL(req.url).pathname;
    const body = new Uint8Array(await req.arrayBuffer());
    if (path.startsWith("/gone")) return new Response(null, { status: 410 });
    if (path.startsWith("/broken")) return new Response(null, { status: 503 });
    received.push(JSON.parse(new TextDecoder().decode(await decryptPushPayload(body, sub, sub.auth))));
    return new Response(null, { status: 201 });
  });
  const target = (path: string): PushTarget => ({
    endpoint: `http://127.0.0.1:${server.addr.port}${path}`,
    p256dh: b64uEncode(sub.publicKey),
    auth: b64uEncode(sub.auth),
  });
  return { received, target, close: () => server.shutdown() };
}

function claimed(id: number, ctx: NotificationContext, targets: PushTarget[], doEmail = true, doPush = true): ClaimedNotification {
  return { id, template: ctx.template, do_email: doEmail, do_push: doPush, is_safety: ctx.is_safety, user_id: "u1", context: ctx,
    push_targets: targets };
}

async function deps(store: NotifyStore, mailer: { send: (m: MailMessage) => Promise<{ id: string }> }, withPush = true):
  Promise<DispatchDeps> {
  const keys = await generateVapidKeys();
  return {
    store,
    sendMail: (m) => mailer.send(m),
    push: withPush ? new WebPushSender(await importVapid(keys.publicKey, keys.privateKey, "mailto:hallo@fermata.example")) : null,
    appUrl: "https://app.fermata.example",
    functionsUrl: "https://projekt.supabase.example/functions/v1",
    venueLinkSecret: "geheim",
  };
}

Deno.test("notify-dispatch: E-Mail und Push zustellen, 410 meldet ungültiges Abo, Lokal bekommt Bestätigungslink", async () => {
  const svc = await fakePushService();
  try {
    const store = new FakeStore([
      claimed(1, memberCtx("evening.confirmed", "sie"), [svc.target("/push/a"), svc.target("/gone/b")]),
      claimed(2, venueCtx("venue.reservation"), [], true, false),
      claimed(3, memberCtx("evening.checkin", "du"), [svc.target("/broken/c")]),
    ]);
    const mailer = new MemoryMailer();
    const stats = await dispatchDue(await deps(store, mailer));

    assertEquals(stats.claimed, 3);
    assertEquals(stats.email_sent, 3);
    assertEquals(stats.push_sent, 1);
    assertEquals(stats.push_removed, 1);
    assertEquals(stats.push_failed, 1);

    assertEquals(mailer.sent.map((m) => m.to), ["anna@example.test", "tisch@cafe.example", "anna@example.test"]);
    assertEquals(svc.received.length, 1);
    const push = svc.received[0] as Record<string, unknown>;
    assertEquals(push.title, "Fermata");
    assertEquals(push.url, `/abende/${EVENING_ID}`);
    assertMatch(String(push.body), /^Der Abend steht: Fr\., 9\. Okt\., 19:30 Uhr\.$/);

    assertEquals(store.pushResults.map((r) => r.status), [201, 410, 503]);
    assertEquals(store.completed[0], { id: 1, email: "sent", push: "sent", error: null });
    assertEquals(store.completed[1], { id: 2, email: "sent", push: null, error: null });
    assertEquals(store.completed[2]!.push, "failed");
    assertStringIncludes(store.completed[2]!.error ?? "", "503");
    assertEquals(store.logs.map((l) => l.status), ["sent", "failed"]);

    // Bestätigungslink in der Mail ans Lokal ist gültig signiert
    const link = /https:\/\/projekt\.supabase\.example\/functions\/v1\/venue-confirm\?t=(\S+)/.exec(mailer.sent[1]!.text);
    assert(link, mailer.sent[1]!.text);
    assertEquals(await verifyVenueToken("geheim", decodeURIComponent(link[1]!), Date.parse("2026-10-09T00:00:00Z")), RES_ID);
  } finally {
    await svc.close();
  }
});

Deno.test("notify-dispatch: nur ungültige Abos → gone; ohne VAPID → Push skipped; Mailfehler → failed", async () => {
  const svc = await fakePushService();
  try {
    const store = new FakeStore([
      claimed(1, memberCtx("evening.reminder", "sie"), [svc.target("/gone/x")], false, true),
      claimed(2, memberCtx("evening.reminder", "sie"), [svc.target("/push/y")]),
    ]);
    const failing = { send: () => Promise.reject(new Error("Brevo antwortet 500")) };
    const d = await deps(store, failing);
    await dispatchDue({ ...d, store });
    assertEquals(store.completed[0], { id: 1, email: null, push: "gone", error: null });
    assertEquals(store.completed[1]!.email, "failed");
    assertEquals(store.completed[1]!.push, "sent");
    assertStringIncludes(store.completed[1]!.error ?? "", "Brevo antwortet 500");

    const store2 = new FakeStore([claimed(5, memberCtx("evening.reminder", "sie"), [svc.target("/push/z")])]);
    const mailer = new MemoryMailer();
    await dispatchDue(await deps(store2, mailer, false));
    assertEquals(store2.completed[0], { id: 5, email: "sent", push: "skipped", error: null });
  } finally {
    await svc.close();
  }
});

Deno.test("notify-dispatch: unbekannte Vorlage wird übersprungen statt verschickt", async () => {
  const store = new FakeStore([claimed(9, memberCtx("test.ping", "sie"), [])]);
  const mailer = new MemoryMailer();
  await dispatchDue(await deps(store, mailer));
  assertEquals(mailer.sent.length, 0);
  assertEquals(store.completed[0], { id: 9, email: "skipped", push: "skipped", error: null });
});

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
Deno.test("Handler notify-dispatch: nur mit Geheimnis", async () => {
  Deno.env.set("NOTIFY_DISPATCH_SECRET", "s3cret-test");
  const store = new FakeStore([]);
  setDispatchDeps(async () => await deps(store, new MemoryMailer()));
  try {
    const url = "http://localhost/functions/v1/notify-dispatch";
    assertEquals((await dispatchHandler(new Request(url, { method: "POST" }))).status, 401);
    assertEquals((await dispatchHandler(new Request(url, { method: "POST", headers: { "x-fermata-dispatch-secret": "falsch" } }))).status,
      401);
    assertEquals((await dispatchHandler(new Request(url, { method: "GET" }))).status, 405);
    const ok = await dispatchHandler(new Request(url, { method: "POST", headers: { "x-fermata-dispatch-secret": "s3cret-test" } }));
    assertEquals(ok.status, 200);
    assertEquals((await ok.json()).claimed, 0);
  } finally {
    setDispatchDeps();
    Deno.env.delete("NOTIFY_DISPATCH_SECRET");
  }
});

Deno.test("Handler push-key: öffentlicher Schlüssel oder 503", async () => {
  Deno.env.delete("VAPID_PUBLIC_KEY");
  const url = "http://localhost/functions/v1/push-key";
  const none = await pushKey(new Request(url));
  assertEquals(none.status, 503);
  assertEquals((await none.json()).error, "push_not_configured");
  const keys = await generateVapidKeys();
  Deno.env.set("VAPID_PUBLIC_KEY", keys.publicKey);
  try {
    const res = await pushKey(new Request(url));
    assertEquals(res.status, 200);
    assertEquals((await res.json()).publicKey, keys.publicKey);
  } finally {
    Deno.env.delete("VAPID_PUBLIC_KEY");
  }
});

Deno.test("Handler venue-confirm: GET zeigt, erst POST bestätigt; falscher Link → 400", async () => {
  Deno.env.set("VENUE_LINK_SECRET", "venue-geheim");
  let confirmed = 0;
  const summary = {
    venue_name: "Café am See",
    starts_at: "2026-10-09T17:30:00Z",
    table_code: "K7QX",
    reservation_name: "Fermata",
    persons: 2,
    status: "reserved",
    venue_confirmed_at: null as string | null,
  };
  setVenueStore({
    summary: () => Promise.resolve(summary),
    confirm: () => {
      confirmed++;
      return Promise.resolve({ ...summary, venue_confirmed_at: "2026-10-08T10:00:00Z" });
    },
  });
  try {
    const token = await signVenueToken("venue-geheim", RES_ID, new Date(Date.now() + 86400_000));
    const url = `http://localhost/functions/v1/venue-confirm?t=${encodeURIComponent(token)}`;
    const get = await venueConfirm(new Request(url));
    assertEquals(get.status, 200);
    const html = await get.text();
    assertStringIncludes(html, "Reservierung bestätigen");
    assertStringIncludes(html, "Tisch-Code: K7QX");
    assertStringIncludes(get.headers.get("content-security-policy") ?? "", "default-src 'none'");
    assertEquals(confirmed, 0, "GET bestätigt nicht");

    const post = await venueConfirm(new Request(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ t: token }).toString(),
    }));
    assertEquals(post.status, 200);
    assertStringIncludes(await post.text(), "Danke, die Reservierung ist bestätigt");
    assertEquals(confirmed, 1);

    const bad = await venueConfirm(new Request("http://localhost/functions/v1/venue-confirm?t=kaputt"));
    assertEquals(bad.status, 400);
    assertStringIncludes(await bad.text(), "Dieser Link gilt nicht mehr");
    const expired = await signVenueToken("venue-geheim", RES_ID, new Date(Date.now() - 1000));
    assertEquals((await venueConfirm(new Request(`http://localhost/x?t=${encodeURIComponent(expired)}`))).status, 400);
    assertEquals((await venueConfirm(new Request(url, { method: "DELETE" }))).status, 405);
  } finally {
    setVenueStore();
    Deno.env.delete("VENUE_LINK_SECRET");
  }
});
