// Mails zur Mitgliedschaft: Bestellung, Zahlung, Kündigung, Widerruf, Verlängerung.
// Ton: ruhig, „Sie“, keine Ausrufezeichen. Eingangsbestätigungen nennen Datum und Uhrzeit (dauerhafter Datenträger).
import { markdownToMailParagraphs } from "../../legal/markdown.ts";
import { renderMail } from "../layout.ts";
import { formatDate, formatDateTime, formatEur, formatReceipt, LEGAL_DRAFT_NOTE, type RenderedMail } from "./billing-format.ts";

const FOOTER = [
  "Fermata verabredet echte Abende in Partner-Lokalen.",
  "Diese Mail ist eine Vertragsmitteilung. Bitte bewahren Sie sie auf.",
];

function mail(template: string, purpose: string, subject: string, content: Parameters<typeof renderMail>[0]): RenderedMail {
  const { html, text } = renderMail({ footer: FOOTER, ...content });
  return { subject, html, text, template, purpose };
}

export interface OrderSummary {
  tier_name: string;
  price_display: string;
  vat_note: string;
  period_label: string;
  evenings_per_period: number;
  tier_note?: string | null;
  renewal: string;
  cancellation_terms: string;
  withdrawal_note: string;
  extension_rule?: string | null;
  button_label: string;
}

/** Widerrufsbelehrung samt Muster-Formular aus ops.legal_documents (Art widerruf). */
export interface WithdrawalPolicy {
  title: string;
  version: string;
  body_markdown: string;
}

export function orderReceived(d: {
  contractNumber: string;
  orderedAt: string | Date;
  withdrawalUntil: string | Date;
  summary: OrderSummary;
  manageUrl: string;
  /** Ausdrückliches Verlangen des Leistungsbeginns (Wortlaut, Fassung, Zeitpunkt) – § 356 Abs. 4 BGB. */
  startRequest?: { text: string; version: string; at: string | Date } | null;
  /** Vollständige Belehrung und Formular (dauerhafter Datenträger, § 312f Abs. 2 BGB). */
  withdrawalPolicy?: WithdrawalPolicy | null;
}): RenderedMail {
  const s = d.summary;
  const evenings = s.evenings_per_period === 1 ? "1 Abend" : `${s.evenings_per_period} Abende`;
  const policy = d.withdrawalPolicy
    ? [
      `${d.withdrawalPolicy.title.toUpperCase()} (Fassung ${d.withdrawalPolicy.version})`,
      ...markdownToMailParagraphs(d.withdrawalPolicy.body_markdown),
    ]
    : [];
  return mail("billing.order_received", "vertrag_bestellung", `Ihre Bestellung bei Fermata (Vertrag ${d.contractNumber})`, {
    preheader: `Eingang Ihrer Bestellung: ${formatReceipt(d.orderedAt)}`,
    greeting: "Guten Tag,",
    paragraphs: [
      `vielen Dank. Wir haben Ihre Bestellung am ${formatReceipt(d.orderedAt)} erhalten. Sie haben dafür den Knopf „${s.button_label}“ gewählt.`,
      `Ihre Vertragsnummer: ${d.contractNumber}. Sie brauchen sie, wenn Sie ohne Anmeldung kündigen oder widerrufen möchten.`,
      `Mitgliedschaft: ${s.tier_name}, ${s.price_display} je ${s.period_label} (${s.vat_note}), ${evenings} je ${s.period_label}.` +
      (s.tier_note ? ` ${s.tier_note}` : ""),
      s.renewal,
      s.cancellation_terms,
      `${s.withdrawal_note} Die Widerrufsfrist endet am ${formatDateTime(d.withdrawalUntil)}.`,
      ...(d.startRequest
        ? [`Bei der Bestellung haben Sie am ${formatReceipt(d.startRequest.at)} erklärt: „${d.startRequest.text}“ (Fassung ${d.startRequest.version}).`]
        : []),
      ...(s.extension_rule ? [s.extension_rule] : []),
      "Die Mitgliedschaft beginnt, sobald Stripe uns die Zahlung bestätigt. Darüber schreiben wir Ihnen gesondert.",
      ...(policy.length ? ["Die vollständige Widerrufsbelehrung und das Muster-Widerrufsformular finden Sie unten in dieser Mail."] : []),
    ],
    button: { label: "Mitgliedschaft ansehen", url: d.manageUrl },
    after: [...policy, LEGAL_DRAFT_NOTE],
  });
}

export function membershipActivated(d: { tierName: string; evenings: number; periodEnd: string | Date; manageUrl: string }): RenderedMail {
  const evenings = d.evenings === 1 ? "einen Abend" : `${d.evenings} Abende`;
  return mail("billing.activated", "vertrag_zahlung", "Ihre Mitgliedschaft bei Fermata ist aktiv", {
    greeting: "Guten Tag,",
    paragraphs: [
      `Ihre Zahlung ist eingegangen. Ihre Mitgliedschaft ${d.tierName} ist aktiv.`,
      `Bis ${formatDateTime(d.periodEnd)} stehen Ihnen ${evenings} zur Verfügung. Wir melden uns, sobald wir einen passenden Vorschlag für Sie haben.`,
    ],
    button: { label: "Mitgliedschaft ansehen", url: d.manageUrl },
  });
}

export function paymentFailed(d: { tierName?: string | null; invoiceUrl?: string | null; manageUrl: string }): RenderedMail {
  return mail("billing.payment_failed", "vertrag_zahlung", "Ihre Zahlung bei Fermata hat nicht geklappt", {
    greeting: "Guten Tag,",
    paragraphs: [
      `die Zahlung für Ihre Mitgliedschaft${d.tierName ? ` ${d.tierName}` : ""} konnte nicht abgebucht werden.`,
      "Stripe versucht es in den nächsten Tagen noch einmal. Wenn sich Ihre Karte oder Ihr Konto geändert hat, können Sie die Zahlungsdaten hier erneuern.",
      "Solange die Zahlung offen ist, schlagen wir Ihnen keine neuen Abende vor. Bereits verabredete Abende bleiben bestehen.",
    ],
    button: d.invoiceUrl ? { label: "Zahlung erneuern", url: d.invoiceUrl } : { label: "Mitgliedschaft ansehen", url: d.manageUrl },
  });
}

export function cancelConfirmation(d: {
  receivedAt: string | Date;
  effectiveAt: string | Date;
  contractNumber: string;
  kind: string;
  reason?: string | null;
  name?: string | null;
  immediate: boolean;
}): RenderedMail {
  const art = d.kind === "ausserordentlich" ? "außerordentliche Kündigung" : "ordentliche Kündigung";
  return mail("billing.cancel_confirmation", "vertrag_kuendigung", `Eingangsbestätigung Ihrer Kündigung (Vertrag ${d.contractNumber})`, {
    preheader: `Eingang Ihrer Kündigung: ${formatReceipt(d.receivedAt)}`,
    greeting: d.name ? `Guten Tag ${d.name},` : "Guten Tag,",
    paragraphs: [
      `wir bestätigen den Eingang Ihrer Kündigung am ${formatReceipt(d.receivedAt)}.`,
      `Vertrag: ${d.contractNumber}. Art: ${art}.` + (d.reason ? ` Angegebener Grund: ${d.reason}` : ""),
      d.immediate
        ? "Ihre Bestellung war noch nicht bezahlt. Sie endet deshalb sofort, es wird nichts abgebucht."
        : `Ihre Mitgliedschaft endet zum ${formatDateTime(d.effectiveAt)}. Bis dahin können Sie Ihre Abende wie gewohnt nutzen. Danach wird nichts mehr abgebucht.`,
      ...(d.kind === "ausserordentlich"
        ? ["Wir prüfen den angegebenen Grund und melden uns, falls die Kündigung früher wirksam werden soll."]
        : []),
      "Diese Mail ist Ihre Bestätigung auf einem dauerhaften Datenträger. Bitte bewahren Sie sie auf.",
    ],
    after: [LEGAL_DRAFT_NOTE],
  });
}

export function contractLink(d: {
  kind: "cancel" | "withdraw";
  url: string;
  requestedAt: string | Date;
  expiresAt: string | Date;
  contractNumber: string;
}): RenderedMail {
  const what = d.kind === "cancel" ? "Kündigung" : "Widerruf";
  return mail(`billing.${d.kind}_link`, d.kind === "cancel" ? "vertrag_kuendigung" : "vertrag_widerruf",
    `Bitte bestätigen Sie Ihren ${what === "Kündigung" ? "Kündigungswunsch" : "Widerruf"} (Vertrag ${d.contractNumber})`, {
      greeting: "Guten Tag,",
      paragraphs: [
        `wir haben am ${formatReceipt(d.requestedAt)} über unser Formular eine Erklärung zum ${what === "Kündigung" ? "Kündigen" : "Widerrufen"} des Vertrags ${d.contractNumber} erhalten.`,
        `Damit niemand anderes in Ihrem Namen handelt, bestätigen Sie die Erklärung bitte über den Knopf. Der Link gilt bis ${formatDateTime(d.expiresAt)}. Als Zeitpunkt des Eingangs gilt der oben genannte.`,
        "Wenn Sie das Formular nicht ausgefüllt haben, können Sie diese Mail einfach löschen. Es passiert dann nichts.",
      ],
      button: { label: d.kind === "cancel" ? "Kündigung bestätigen" : "Widerruf bestätigen", url: d.url },
      after: [LEGAL_DRAFT_NOTE],
    });
}

export function withdrawReceipt(d: {
  receivedAt: string | Date;
  contractNumber: string;
  name?: string | null;
  paidCents: number;
  eveningsUsed: number;
  wertersatzCents: number;
  refundCents: number;
  refundStatus: "erstattet" | "in_bearbeitung" | "keine";
}): RenderedMail {
  const used = d.eveningsUsed === 1 ? "1 Abend" : `${d.eveningsUsed} Abende`;
  const refund = d.refundStatus === "erstattet"
    ? `Wir erstatten Ihnen ${formatEur(d.refundCents)} auf das Zahlungsmittel, mit dem Sie bezahlt haben. Je nach Bank dauert die Gutschrift einige Tage.`
    : d.refundStatus === "in_bearbeitung"
    ? `Wir erstatten Ihnen ${formatEur(d.refundCents)}. Die Erstattung bearbeiten wir von Hand und schreiben Ihnen, sobald sie veranlasst ist.`
    : "Es ist kein Betrag zu erstatten.";
  return mail("billing.withdraw_receipt", "vertrag_widerruf", `Eingangsbestätigung Ihres Widerrufs (Vertrag ${d.contractNumber})`, {
    preheader: `Eingang Ihres Widerrufs: ${formatReceipt(d.receivedAt)}`,
    greeting: d.name ? `Guten Tag ${d.name},` : "Guten Tag,",
    paragraphs: [
      `wir bestätigen den Eingang Ihres Widerrufs am ${formatReceipt(d.receivedAt)}.`,
      `Vertrag: ${d.contractNumber}. Ihre Mitgliedschaft endet mit dem Widerruf sofort. Bereits verabredete Abende haben wir abgesagt.`,
      `Bezahlt: ${formatEur(d.paidCents)}. Genutzt: ${used}. Wertersatz für genutzte Abende: ${formatEur(d.wertersatzCents)}.`,
      refund,
      "Diese Mail ist Ihre Bestätigung auf einem dauerhaften Datenträger. Bitte bewahren Sie sie auf.",
    ],
    after: [LEGAL_DRAFT_NOTE],
  });
}

export function periodExtended(d: { extendedUntil: string | Date; tierName?: string | null; manageUrl: string }): RenderedMail {
  return mail("billing.extended", "vertrag_verlaengerung", "Ihr Zeitraum bei Fermata wurde verlängert", {
    greeting: "Guten Tag,",
    paragraphs: [
      "in Ihrem laufenden Zeitraum ist kein Abend zustande gekommen, und das lag nicht an Ihnen.",
      `Deshalb verlängern wir Ihren Zeitraum ohne Zahlung bis ${formatDate(d.extendedUntil)}. Ihre übrigen Abende bleiben bis dahin erhalten.` +
      (d.tierName ? ` Ihre Stufe ${d.tierName} bleibt gleich.` : ""),
      "Die nächste Abbuchung verschiebt sich entsprechend.",
    ],
    button: { label: "Mitgliedschaft ansehen", url: d.manageUrl },
  });
}
