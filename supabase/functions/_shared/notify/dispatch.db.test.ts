// Integrationstests gegen die Test-Datenbank (nur mit FERMATA_TEST_DB_URL, z. B.
//   FERMATA_TEST_DB_URL=postgres://postgres:postgres@localhost:54372/postgres deno test --allow-all _shared/notify/dispatch.db.test.ts
// nach `bash scripts/db.sh test`). Ohne Variable werden die Tests übersprungen.
//  1. Versand über die echten SQL-Funktionen (notify_claim → notification_context → notify_complete) mit
//     MemoryMailer und nachgebautem Push-Dienst; alles in einer Transaktion, am Ende zurückgerollt.
//  2. Zwei gleichzeitige Bestätigungen für den letzten Tisch über zwei Verbindungen (echte Parallelität).
import { assert, assertEquals, assertMatch, assertStringIncludes } from "@std/assert";
import postgres from "postgres";
import type { Sql } from "../db.ts";
import { MemoryMailer } from "../mail/outbox.ts";
import { b64uEncode, decryptPushPayload, generateVapidKeys, importVapid, WebPushSender } from "../push/mod.ts";
import { dispatchDue } from "./dispatch.ts";
import { PgNotifyStore } from "./store.ts";

const url = Deno.env.get("FERMATA_TEST_DB_URL");
const fixtures = new URL("../../../tests/500_fixtures.sql", import.meta.url);

class Rollback extends Error {}

async function browserSubscription() {
  const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]) as CryptoKeyPair;
  const publicKey = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const auth = crypto.getRandomValues(new Uint8Array(16));
  return { publicKey, privateKey: pair.privateKey, auth };
}

Deno.test({
  name: "DB: Vorschlag und Bestätigung werden über die SQL-Funktionen verschickt (Mail, Push, 410, Lokal)",
  ignore: !url,
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const sql = postgres(url!, { max: 1, onnotice: () => {} });
    const sub = await browserSubscription();
    const received: Record<string, unknown>[] = [];
    const server = Deno.serve({ port: 0, hostname: "127.0.0.1", onListen: () => {} }, async (req) => {
      const path = new URL(req.url).pathname;
      const body = new Uint8Array(await req.arrayBuffer());
      if (path.startsWith("/gone")) return new Response(null, { status: 410 });
      received.push(JSON.parse(new TextDecoder().decode(await decryptPushPayload(body, sub, sub.auth))));
      return new Response(null, { status: 201 });
    });
    const base = `http://127.0.0.1:${server.addr.port}`;
    try {
      await sql.begin(async (tx) => {
        await tx.unsafe(await Deno.readTextFile(fixtures));
        // Mittags, damit keine Ruhezeit greift
        await tx`update ops.sim_clock set offset_interval = app.berlin_at((now() at time zone 'Europe/Berlin')::date + 1, '12:00') - now()`;
        await tx`select tests.m5_setup()`;
        const [ids] = await tx`select tests.m5_id('anna') as anna, tests.m5_id('ben') as ben`;
        await tx`insert into app.consents (user_id, kind, action, document_version) values (${ids!.anna}, 'push', 'granted', 'v1')`;
        await tx`insert into app.push_subscriptions (user_id, endpoint, p256dh, auth) values
          (${ids!.anna}, ${base + "/push/anna"}, ${b64uEncode(sub.publicKey)}, ${b64uEncode(sub.auth)}),
          (${ids!.anna}, ${base + "/gone/alt"}, ${b64uEncode(sub.publicKey)}, ${b64uEncode(sub.auth)})`;
        const [e1] = await tx`select tests.m5_new_evening(${ids!.anna}, ${ids!.ben},
          array[tests.m5_at(4, '19:00'), tests.m5_at(4, '19:30'), tests.m5_at(5, '19:00')]) as id`;
        const [e2] = await tx`select tests.m5_confirmed_evening(tests.m5_id('cem'), tests.m5_id('emil'), tests.m5_at(5, '20:00')) as id`;

        const mailer = new MemoryMailer();
        const keys = await generateVapidKeys();
        const stats = await dispatchDue({
          store: new PgNotifyStore(tx as unknown as Sql),
          sendMail: (m) => mailer.send(m),
          push: new WebPushSender(await importVapid(keys.publicKey, keys.privateKey, "mailto:hallo@fermata.example")),
          appUrl: "https://app.fermata.example",
          functionsUrl: "https://projekt.supabase.example/functions/v1",
          venueLinkSecret: "geheim",
        });

        // Vorschlag an Anna (Sie) und Ben (du), Bestätigung an Cem und Emil, Wunschzeit an Emil, Reservierung ans Lokal
        const byTemplate = (t: string) => mailer.sent.filter((m) => m.template === t);
        assertEquals(byTemplate("evening.proposed").length, 2);
        const anna = byTemplate("evening.proposed").find((m) => m.to === "anna@example.test")!;
        assertStringIncludes(anna.text, "Guten Tag, Anna,");
        assertStringIncludes(anna.text, "Warum Sie beide: Sie gehen beide gern am Wasser spazieren.");
        assertStringIncludes(anna.text, "Café am See, Seestraße 1, 19053 Schwerin");
        assertEquals((anna.text.match(/^– /gm) ?? []).length, 3, "drei Zeiten");
        assertStringIncludes(anna.text, `/abende/${e1!.id}`);
        assert(!anna.text.includes("Ben") && !anna.text.includes("Brückner"), "Mail nennt das Gegenüber nicht");
        const ben = byTemplate("evening.proposed").find((m) => m.to === "ben@example.test")!;
        assertStringIncludes(ben.text, "Hallo Ben,");
        assertEquals(byTemplate("evening.confirmed").length, 2);
        // Wunschzeit an Emil ist durch die Bestätigung überholt: nicht mehr verschickt
        assertEquals(byTemplate("evening.time_requested").length, 0);
        const [outdated] = await tx`select count(*)::int as n from ops.notification_queue
          where evening_id = ${e2!.id} and template in ('evening.proposed', 'evening.time_requested') and skip_reason = 'outdated'`;
        assertEquals(outdated!.n, 3);
        const venue = byTemplate("venue.reservation");
        assertEquals(venue.length, 1);
        assertEquals(venue[0]!.to, "tisch@cafe.example");
        const [res] = await tx`select table_code, venue_notified_at from app.evening_reservations where evening_id = ${e2!.id}`;
        assertStringIncludes(venue[0]!.text, `Tisch-Code: ${res!.table_code}`);
        assertMatch(venue[0]!.text, /venue-confirm\?t=/);
        assert(!/Cem|Emil|Celik|Eckert|example\.test/.test(venue[0]!.text), "Lokal erfährt keine Mitgliederdaten");
        assert(res!.venue_notified_at, "Reservierung als verschickt markiert");

        // Push nur an Anna (Einwilligung + Abo); das ungültige Abo ist danach gelöscht
        assertEquals(received.length, 1);
        assertEquals(received[0]!.url, `/abende/${e1!.id}`);
        assert(!String(received[0]!.body).includes("Ben"));
        assertEquals(stats.push_removed, 1);
        const subs = await tx`select endpoint from app.push_subscriptions where user_id = ${ids!.anna}`;
        assertEquals(subs.map((s) => s.endpoint), [base + "/push/anna"]);
        const [log] = await tx`select count(*)::int as n from ops.notifications_log where user_id = ${ids!.anna} and channel = 'push' and status = 'sent'`;
        assertEquals(log!.n, 1);

        // Alles erledigt, nichts mehr fällig
        const [open] = await tx`select count(*)::int as n from ops.notification_queue where sent_at is null and failed_at is null`;
        assertEquals(open!.n, 0);
        const again = await dispatchDue({
          store: new PgNotifyStore(tx as unknown as Sql),
          sendMail: (m) => mailer.send(m),
          push: null,
          appUrl: "https://app.fermata.example",
        });
        assertEquals(again.claimed, 0, "zweiter Lauf verschickt nichts doppelt");
        throw new Rollback();
      });
    } catch (err) {
      if (!(err instanceof Rollback)) throw err;
    } finally {
      await server.shutdown();
      await sql.end();
    }
  },
});

Deno.test({
  name: "DB: zwei gleichzeitige Bestätigungen für den letzten Tisch – die zweite wartet auf die Sperre und bekommt no_table_free",
  ignore: !url,
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const admin = postgres(url!, { max: 1, onnotice: () => {} });
    const c1 = postgres(url!, { max: 1, onnotice: () => {} });
    const c2 = postgres(url!, { max: 1, onnotice: () => {} });
    const users = Array.from({ length: 4 }, () => crypto.randomUUID()).sort();
    const [a1, b1, a2, b2] = users as [string, string, string, string];
    const venueId = crypto.randomUUID();
    const runId = crypto.randomUUID();
    let e1 = "";
    let e2 = "";
    let at = "";
    try {
      for (const u of users) {
        await admin`select tests.create_user(${`race-${u}@example.test`}, ${u})`;
        await admin`insert into app.accounts (user_id, status) values (${u}, 'active')`;
      }
      await admin`insert into app.venues (id, name, street, postal_code, city, lat, lon, contact_email)
        values (${venueId}, 'Rennbahn-Café', 'Weg 1', '19053', 'Schwerin', 53.6, 11.4, 'race@cafe.example')`;
      const [slot] = await admin`insert into app.venue_slots (venue_id, starts_at, tables)
        values (${venueId}, app.berlin_at((now() at time zone 'Europe/Berlin')::date + 4, '21:15'), 1) returning starts_at`;
      at = (slot!.starts_at as Date).toISOString();
      await admin`insert into app.match_runs (id, scheduled_for, status) values (${runId}, now(), 'approved')`;
      for (const [x, y, set] of [[a1, b1, (v: string) => (e1 = v)], [a2, b2, (v: string) => (e2 = v)]] as const) {
        const [p] = await admin`insert into app.pairings (run_id, user_a, user_b, total_score, venue_id, status)
          values (${runId}, ${x}, ${y}, 0.7, ${venueId}, 'proposed') returning id`;
        const [e] = await admin`insert into app.evenings (pairing_id, user_a, user_b, venue_id, proposed_times)
          values (${p!.id}, ${x}, ${y}, ${venueId}, jsonb_build_array(${at}::text)) returning id`;
        set(e!.id as string);
      }
      const asMember = async (tx: postgres.TransactionSql, uid: string) => {
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: uid, role: "authenticated" })}, true),
                        set_config('request.jwt.claim.sub', ${uid}, true)`;
        await tx`set local role authenticated`;
      };
      await admin.begin(async (tx) => {
        await asMember(tx, a1);
        await tx`select api.evening_request_time(${e1}, ${[at]}::timestamptz[])`;
      });
      await admin.begin(async (tx) => {
        await asMember(tx, a2);
        await tx`select api.evening_request_time(${e2}, ${[at]}::timestamptz[])`;
      });

      let firstDone!: () => void;
      const firstConfirmed = new Promise<void>((r) => (firstDone = r));
      let release!: () => void;
      const gate = new Promise<void>((r) => (release = r));
      const t1 = c1.begin(async (tx) => {
        await asMember(tx, b1);
        await tx`select api.evening_confirm(${e1}, ${at}::timestamptz)`;
        firstDone();
        await gate; // Transaktion bleibt offen, die Zeilensperre auf dem Platz hält
      });
      await firstConfirmed;
      let secondSettled = false;
      const t2 = c2.begin(async (tx) => {
        await asMember(tx, b2);
        await tx`select api.evening_confirm(${e2}, ${at}::timestamptz)`;
      }).then(() => "ok", (err) => err).finally(() => (secondSettled = true));
      await new Promise((r) => setTimeout(r, 400));
      assertEquals(secondSettled, false, "zweite Bestätigung wartet auf die Sperre");
      release();
      await t1;
      const second = await t2;
      assert(second instanceof Error, "zweite Bestätigung scheitert");
      assertEquals((second as { hint?: string }).hint, "no_table_free");

      const [s] = await admin`select reserved, tables from app.venue_slots where venue_id = ${venueId}`;
      assertEquals([s!.reserved, s!.tables], [1, 1]);
      const states = await admin`select id, state from app.evenings where id in (${e1}, ${e2}) order by id = ${e1} desc`;
      assertEquals(states.map((r) => r.state), ["confirmed", "time_requested"]);
    } finally {
      await admin`delete from auth.users where id in ${admin(users)}`;
      await admin`delete from app.venues where id = ${venueId}`;
      await admin`delete from app.match_runs where id = ${runId}`;
      await Promise.all([admin.end(), c1.end(), c2.end()]);
    }
  },
});
