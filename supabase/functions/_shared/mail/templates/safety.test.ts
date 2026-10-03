import { strict as assert } from "node:assert";
import { checkText } from "../../../../../scripts/check-tone.mjs";
import { safetyMailTemplates } from "./safety.ts";

const ctx = { appUrl: "https://app.fermata.test", helpNumber: "030 12074182" };

const SAMPLES: Record<string, Record<string, unknown>> = {
  "safety.report_received": { due_hours: 24, wants_contact: true, category_label: "Bedrohung" },
  "safety.evening_cancelled": { starts_at: "2026-10-09T17:30:00Z", venue_name: "Weinstube am See", was_confirmed: true },
  "safety.account_suspended": { provisional: true },
  "safety.sanction_notice": { kind: "sperre", ends_at: "2026-10-20T10:00:00Z", reason: "Wiederholt unangemessenes Verhalten." },
  "safety.sanction_lifted": { reason: "aufgehoben" },
  "safety.appeal_received": {},
  "safety.appeal_decided": { decision: "rejected", note: "Die Meldung wurde bestätigt." },
  "safety.report_closed": {},
  "safety.admin_alert": { kind: "checkin_hilfe", severity: "akut", starts_at: "2026-10-09T17:30:00Z", venue_name: "Weinstube am See" },
};

Deno.test("Sicherheits-Mails: jede Vorlage rendert, Sie-Form, Tonalitätsregeln", () => {
  assert.deepEqual(Object.keys(SAMPLES).sort(), Object.keys(safetyMailTemplates).sort());
  for (const [key, data] of Object.entries(SAMPLES)) {
    const m = safetyMailTemplates[key]!(data, ctx);
    assert.equal(m.template, key);
    assert.ok(m.subject.length > 5 && m.text.length > 50, key);
    assert.ok(!/\bdu\b|\bdein/i.test(m.text), `Du-Form in ${key}`);
    assert.deepEqual(checkText("supabase/functions/_shared/mail/templates/rendered.ts", JSON.stringify([m.subject, m.text])), [], key);
  }
});

Deno.test("Abend fällt aus: neutral, ohne Grund, ohne andere Person", () => {
  const m = safetyMailTemplates["safety.evening_cancelled"]!(SAMPLES["safety.evening_cancelled"]!, ctx);
  assert.equal(m.subject, "Ihr Abend findet nicht statt");
  assert.ok(m.text.includes("Freitag, 9. Oktober 2026, 19:30 Uhr") && m.text.includes("Weinstube am See"));
  assert.ok(!/meldung|gemeldet|sperr|sicherheit|bedroh|verstoß/i.test(m.text), "kein Grund im Text");
  const proposal = safetyMailTemplates["safety.evening_cancelled"]!({ was_confirmed: false }, ctx);
  assert.ok(proposal.text.includes("Vorschlag"));
});

Deno.test("Sperre: die gemeldete Person erfährt nicht, wer gemeldet hat", () => {
  const m = safetyMailTemplates["safety.account_suspended"]!({ provisional: true, report_id: "r1", reporter: "x" }, ctx);
  assert.ok(m.text.includes("vorübergehend gesperrt") && /widersprech/i.test(m.text));
  assert.ok(!/gemeldet|meldende|Meldung von/i.test(m.text));
});

Deno.test("Meldung erhalten: Frist und Anonymität", () => {
  const m = safetyMailTemplates["safety.report_received"]!({ due_hours: 24, wants_contact: false }, ctx);
  assert.ok(m.text.includes("24 Stunden") && m.text.includes("keine Rückmeldung"));
  assert.ok(m.text.includes("erfährt nicht, wer gemeldet hat"));
});

Deno.test("Hinweis an Benn: keine Namen, Link in den Admin-Bereich", () => {
  const m = safetyMailTemplates["safety.admin_alert"]!(SAMPLES["safety.admin_alert"]!, ctx);
  assert.match(m.subject, /^\[AKUT\] Check-in: Ein Mitglied braucht Hilfe/);
  assert.ok(m.text.includes("https://app.fermata.test/admin/sicherheit"));
  assert.ok(m.text.includes("110"));
});
