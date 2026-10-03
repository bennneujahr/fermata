// Datenbank-Test (SUPABASE_DB_URL): Versand der Sicherheits-Mails.
import { strict as assert } from "node:assert";
import { createMember, deleteUsers, hasDb, INTERNAL_SECRET, setupEnv, testSql, useMemoryMailer } from "../_shared/stripe/testing.ts";
import handler from "./handler.ts";

setupEnv();
const opts = { ignore: !hasDb, sanitizeOps: false, sanitizeResources: false };

Deno.test({ name: "safety-dispatch: nur mit internem Geheimnis; verschickt an Mitglied und an Benn; kein doppelter Versand", ...opts, fn: async () => {
  const sql = testSql();
  const mailer = useMemoryMailer();
  const m = await createMember(sql);
  try {
    const anon = await handler(new Request("https://fn.fermata.test/functions/v1/safety-dispatch", { method: "POST" }));
    assert.equal(anon.status, 401);
    const wrong = await handler(new Request("https://fn.fermata.test/functions/v1/safety-dispatch", {
      method: "POST", headers: { "x-fermata-internal-secret": "falsch" },
    }));
    assert.equal(wrong.status, 401);

    // Liegengebliebenes aus anderen Tests nicht mitzählen
    await sql`update safety.mail_queue set sent_at = now() where sent_at is null`;
    await sql`select safety.enqueue_mail(${m.id}::uuid, false, 'safety.report_received', '{"due_hours": 24, "wants_contact": true}'::jsonb)`;
    await sql`select safety.enqueue_mail(null, true, 'safety.admin_alert', '{"kind": "checkin_hilfe", "severity": "akut"}'::jsonb)`;
    await sql`select safety.enqueue_mail(${m.id}::uuid, false, 'safety.gibt_es_nicht', '{}'::jsonb)`;

    const res = await handler(new Request("https://fn.fermata.test/functions/v1/safety-dispatch", {
      method: "POST", headers: { "x-fermata-internal-secret": INTERNAL_SECRET },
    }));
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { sent: 2, failed: 1 });
    assert.deepEqual(mailer.sent.map((x) => [x.template, x.to]).sort(), [
      ["safety.admin_alert", "sicherheit@fermata.example"],
      ["safety.report_received", m.email],
    ]);
    const [row] = await sql`select count(*)::int as n from safety.mail_queue where template = 'safety.gibt_es_nicht' and last_error like 'Unbekannte Vorlage%' and sent_at is null`;
    assert.equal(row!.n, 1, "Fehlversuch wird vermerkt");

    const again = await handler(new Request("https://fn.fermata.test/functions/v1/safety-dispatch", {
      method: "POST", headers: { authorization: `Bearer ${INTERNAL_SECRET}` },
    }));
    assert.equal((await again.json()).sent, 0, "Versendetes geht nicht noch einmal raus");
  } finally {
    await sql`delete from safety.mail_queue where to_admin and data ->> 'kind' = 'checkin_hilfe' and created_at > now() - interval '1 minute'`;
    await deleteUsers(sql, [m.id]);
    await sql.end();
  }
} });
