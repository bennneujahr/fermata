import { strict as assert } from "node:assert";
import { checkText } from "../../../../../scripts/check-tone.mjs";
import {
  cancelConfirmation,
  contractLink,
  membershipActivated,
  orderReceived,
  type OrderSummary,
  paymentFailed,
  periodExtended,
  withdrawReceipt,
} from "./billing.ts";
import { formatDateTime, formatEur, formatReceipt } from "./billing-format.ts";
import type { RenderedMail } from "./billing-format.ts";
import { extractSegments, toAppMarkdown } from "../../legal/markdown.ts";

// Die echte Widerrufsbelehrung aus docs/recht (so steht sie auch in ops.legal_documents).
const POLICY_SEGMENT = extractSegments(
  await Deno.readTextFile(new URL("../../../../../docs/recht/widerrufsbelehrung.md", import.meta.url)),
).find((x) => x.kind === "widerruf")!;
const POLICY = { title: POLICY_SEGMENT.title, version: POLICY_SEGMENT.version, body_markdown: toAppMarkdown(POLICY_SEGMENT.body) };
const START = {
  text: "Ich verlange ausdrücklich, dass Fermata vor Ende der Widerrufsfrist mit der Leistung beginnt. Mir ist bekannt, dass ich bei einem Widerruf Wertersatz für bereits genutzte Abende leisten muss.",
  version: "2026-10-03-entwurf",
  at: "2026-10-03T17:45:12Z",
};

const SUMMARY: OrderSummary = {
  tier_name: "Andante",
  price_display: "149,00 €",
  vat_note: "inkl. 19 % USt",
  period_label: "4 Wochen",
  evenings_per_period: 2,
  tier_note: null,
  renewal: "Die Mitgliedschaft verlängert sich automatisch um jeweils 4 Wochen, bis Sie kündigen.",
  cancellation_terms: "ENTWURF: Sie können jederzeit zum Ende des laufenden Zeitraums kündigen.",
  withdrawal_note: "ENTWURF: Sie können den Vertrag innerhalb von 14 Tagen widerrufen.",
  extension_rule: null,
  button_label: "Mitgliedschaft zahlungspflichtig abschließen",
};
const AT = "2026-10-03T17:45:12Z";

function all(): RenderedMail[] {
  return [
    orderReceived({ contractNumber: "FM-ABCD-EFGH", orderedAt: AT, withdrawalUntil: "2026-10-17T17:45:12Z", summary: SUMMARY, manageUrl: "https://app/x" }),
    membershipActivated({ tierName: "Andante", evenings: 2, periodEnd: "2026-10-31T17:45:12Z", manageUrl: "https://app/x" }),
    paymentFailed({ tierName: "Andante", invoiceUrl: "https://invoice.stripe.com/i/1", manageUrl: "https://app/x" }),
    cancelConfirmation({ receivedAt: AT, effectiveAt: "2026-10-31T17:45:12Z", contractNumber: "FM-ABCD-EFGH", kind: "ordentlich", immediate: false }),
    cancelConfirmation({ receivedAt: AT, effectiveAt: AT, contractNumber: "FM-ABCD-EFGH", kind: "ausserordentlich", reason: "Umzug", immediate: true }),
    contractLink({ kind: "cancel", url: "https://fn/billing-cancel?t=x", requestedAt: AT, expiresAt: AT, contractNumber: "FM-ABCD-EFGH" }),
    contractLink({ kind: "withdraw", url: "https://fn/billing-withdraw?t=x", requestedAt: AT, expiresAt: AT, contractNumber: "FM-ABCD-EFGH" }),
    withdrawReceipt({ receivedAt: AT, contractNumber: "FM-ABCD-EFGH", name: "Mara", paidCents: 14900, eveningsUsed: 1, wertersatzCents: 7450, refundCents: 7450, refundStatus: "erstattet" }),
    withdrawReceipt({ receivedAt: AT, contractNumber: "FM-ABCD-EFGH", paidCents: 4900, eveningsUsed: 1, wertersatzCents: 4900, refundCents: 0, refundStatus: "keine" }),
    periodExtended({ extendedUntil: "2026-11-28T17:45:12Z", tierName: "Andante", manageUrl: "https://app/x" }),
    orderReceived({
      contractNumber: "FM-ABCD-EFGH", orderedAt: AT, withdrawalUntil: "2026-10-17T17:45:12Z", summary: SUMMARY,
      manageUrl: "https://app/x", startRequest: START, withdrawalPolicy: POLICY,
    }),
  ];
}

Deno.test("Bestellbestätigung: Erklärung zum Leistungsbeginn und vollständige Widerrufsbelehrung mit Formular", () => {
  const m = all().at(-1)!;
  assert.ok(m.text.includes(`„${START.text}“`), "Wortlaut der Erklärung");
  assert.ok(m.text.includes("Fassung 2026-10-03-entwurf"));
  for (const s of ["WIDERRUFSBELEHRUNG", "Widerrufsrecht".toUpperCase(), "binnen vierzehn Tagen", "Folgen des Widerrufs".toUpperCase(),
    "MUSTER-WIDERRUFSFORMULAR", "Hiermit widerrufe(n) ich/wir", "Unzutreffendes streichen", "Ende der Widerrufsbelehrung"]) {
    assert.ok(m.text.includes(s), `fehlt: ${s}`);
  }
  assert.ok(m.html.includes("Muster-Widerrufsformular") || m.html.includes("MUSTER-WIDERRUFSFORMULAR"));
  assert.ok(!m.text.includes("**") && !m.text.includes("<!--"), "kein Markdown, keine Markierungen in der Mail");
  // Die Fassung ohne Belehrung (alte Aufrufe) bleibt gültig.
  assert.ok(!all()[0]!.text.includes("MUSTER-WIDERRUFSFORMULAR"));
});

Deno.test("Formate: Datum, Uhrzeit, Eingang mit Sekunden und Zeitzone, Euro", () => {
  assert.equal(formatDateTime(AT), "Samstag, 3. Oktober 2026, 19:45 Uhr");
  assert.equal(formatReceipt(AT), "03.10.2026, 19:45:12 Uhr (MESZ)");
  assert.equal(formatReceipt("2026-12-01T08:00:00Z"), "01.12.2026, 09:00:00 Uhr (MEZ)");
  assert.equal(formatEur(7450), "74,50 €");
});

Deno.test("Bestellbestätigung: Eingang, Vertragsnummer, Knopftext, Preis, Widerrufsfrist, ENTWURF", () => {
  const m = all()[0]!;
  assert.match(m.subject, /FM-ABCD-EFGH/);
  for (const s of ["03.10.2026, 19:45:12 Uhr", "Mitgliedschaft zahlungspflichtig abschließen", "149,00 €", "inkl. 19 % USt", "2 Abende", "ENTWURF", "17. Oktober 2026"]) {
    assert.ok(m.text.includes(s), `fehlt: ${s}`);
  }
});

Deno.test("Kündigungs- und Widerrufsbestätigung nennen Datum und Uhrzeit des Eingangs", () => {
  const [, , , cancel, cancelImmediate, , , withdraw, withdrawNone] = all();
  for (const m of [cancel!, cancelImmediate!, withdraw!, withdrawNone!]) {
    assert.ok(m.text.includes("03.10.2026, 19:45:12 Uhr (MESZ)"), m.template);
    assert.ok(m.text.includes("dauerhaften Datenträger"), m.template);
  }
  assert.ok(cancel!.text.includes("ordentliche Kündigung"));
  assert.ok(cancelImmediate!.text.includes("außerordentliche Kündigung") && cancelImmediate!.text.includes("Umzug"));
  assert.ok(withdraw!.text.includes("74,50 €") && withdraw!.text.includes("Wertersatz"));
  assert.ok(withdrawNone!.text.includes("kein Betrag zu erstatten"));
});

Deno.test("Alle Billing-Mails: Sie-Form, keine Ausrufezeichen, Tonalitätsregeln, HTML und Text", () => {
  for (const m of all()) {
    assert.ok(m.html.startsWith("<!doctype html>"), m.template);
    assert.ok(!/\bdu\b|\bdein/i.test(m.text), `Du-Form in ${m.template}`);
    const findings = checkText("supabase/functions/_shared/mail/templates/rendered.ts", JSON.stringify([m.subject, m.text]));
    assert.deepEqual(findings, [], `${m.template}: ${JSON.stringify(findings)}`);
    assert.ok(m.purpose && m.template.startsWith("billing."));
  }
});
