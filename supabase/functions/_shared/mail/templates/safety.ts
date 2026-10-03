// Sicherheits-Mails (Versand über safety-dispatch aus safety.mail_queue).
// Grundsätze: Die gemeldete Person erfährt nie, wer gemeldet hat. Das Gegenüber eines abgesagten Abends
// erfährt keinen Grund. Hinweise an Benn enthalten keine Namen, nur das Nötige und einen Link in den Admin-Bereich.
import { renderMail } from "../layout.ts";
import { formatDateTime, type RenderedMail } from "./billing-format.ts";

export interface SafetyMailContext {
  appUrl: string;
  helpNumber?: string;
}

type Data = Record<string, unknown>;

const FOOTER = ["Fermata verabredet echte Abende in Partner-Lokalen.", "Bei akuter Gefahr wählen Sie bitte 110."];

function mail(template: string, purpose: string, subject: string, content: Parameters<typeof renderMail>[0]): RenderedMail {
  const { html, text } = renderMail({ footer: FOOTER, ...content });
  return { subject, html, text, template, purpose };
}

function text(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

export function reportReceived(d: Data, ctx: SafetyMailContext): RenderedMail {
  const hours = typeof d.due_hours === "number" ? d.due_hours : 24;
  return mail("safety.report_received", "sicherheit_meldung", "Wir haben Ihre Meldung erhalten", {
    greeting: "Guten Tag,",
    paragraphs: [
      "danke, dass Sie uns Bescheid gegeben haben. Ihre Meldung ist bei uns eingegangen.",
      d.wants_contact === false
        ? `Wir sehen uns Ihre Meldung innerhalb von ${hours} Stunden an. Sie hatten angegeben, dass Sie keine Rückmeldung wünschen.`
        : `Wir sehen uns Ihre Meldung innerhalb von ${hours} Stunden an und melden uns bei Ihnen.`,
      "Die gemeldete Person erfährt nicht, wer gemeldet hat.",
      `Wenn Sie sich gerade nicht sicher fühlen: Das Heimwegtelefon begleitet Sie am Telefon${ctx.helpNumber ? ` (${ctx.helpNumber})` : ""}. Bei akuter Gefahr wählen Sie 110.`,
    ],
    button: { label: "Hilfe und Kontakte", url: `${ctx.appUrl}/hilfe` },
  });
}

export function eveningCancelled(d: Data, ctx: SafetyMailContext): RenderedMail {
  const when = text(d.starts_at) ? formatDateTime(String(d.starts_at)) : undefined;
  const venue = text(d.venue_name);
  const which = when ? ` am ${when}${venue ? ` (${venue})` : ""}` : "";
  return mail("safety.evening_cancelled", "abend_absage", "Ihr Abend findet nicht statt", {
    greeting: "Guten Tag,",
    paragraphs: [
      d.was_confirmed === true
        ? `Ihr verabredeter Abend${which} findet leider nicht statt.`
        : "Ihr aktueller Vorschlag für einen Abend entfällt leider.",
      "Der Grund liegt nicht bei Ihnen. Den Abend schreiben wir Ihnen wieder gut.",
      "Wir melden uns, sobald wir einen neuen Vorschlag für Sie haben.",
    ],
    button: { label: "Zu Fermata", url: ctx.appUrl },
  });
}

export function accountSuspended(_d: Data, ctx: SafetyMailContext): RenderedMail {
  return mail("safety.account_suspended", "sicherheit_sperre", "Ihr Konto bei Fermata ist vorübergehend gesperrt", {
    greeting: "Guten Tag,",
    paragraphs: [
      "wir prüfen gerade einen Hinweis, der Ihr Konto betrifft. Bis die Prüfung abgeschlossen ist, ist Ihr Konto vorübergehend gesperrt. Das ist eine Vorsichtsmaßnahme und noch keine Entscheidung.",
      "In dieser Zeit finden keine Abende statt; bereits verabredete Abende haben wir abgesagt.",
      "Wir melden uns, sobald wir entschieden haben, in der Regel innerhalb weniger Tage. Wenn Sie widersprechen möchten, können Sie das in Ihrem Konto tun.",
    ],
    button: { label: "Konto ansehen", url: `${ctx.appUrl}/konto/sicherheit` },
  });
}

const SANCTION_TEXT: Record<string, string> = {
  hinweis: "Wir möchten Sie auf unsere Regeln für die Abende hinweisen.",
  sperre: "Ihr Konto ist gesperrt.",
  ausschluss: "Wir haben entschieden, Sie dauerhaft von Fermata auszuschließen.",
};

export function sanctionNotice(d: Data, ctx: SafetyMailContext): RenderedMail {
  const kind = text(d.kind) ?? "hinweis";
  const until = text(d.ends_at) ? ` bis ${formatDateTime(String(d.ends_at))}` : "";
  const first = kind === "sperre" ? `Ihr Konto ist${until} gesperrt.` : (SANCTION_TEXT[kind] ?? SANCTION_TEXT.hinweis!);
  return mail("safety.sanction_notice", "sicherheit_sanktion", kind === "hinweis" ? "Ein Hinweis von Fermata" : "Eine Entscheidung zu Ihrem Konto", {
    greeting: "Guten Tag,",
    paragraphs: [
      first,
      ...(text(d.reason) ? [`Begründung: ${text(d.reason)}`] : []),
      ...(kind !== "hinweis" ? ["In dieser Zeit finden keine Abende statt."] : []),
      "Sie können innerhalb Ihres Kontos einmal Widerspruch einlegen. Wir prüfen ihn und antworten Ihnen per Mail.",
    ],
    button: { label: "Widerspruch einlegen", url: `${ctx.appUrl}/konto/sicherheit` },
  });
}

export function sanctionLifted(d: Data, ctx: SafetyMailContext): RenderedMail {
  return mail("safety.sanction_lifted", "sicherheit_sanktion", "Ihr Konto bei Fermata ist wieder frei", {
    greeting: "Guten Tag,",
    paragraphs: [
      d.reason === "abgelaufen"
        ? "die Sperre Ihres Kontos ist abgelaufen. Ihr Konto ist wieder freigeschaltet."
        : "wir haben die Prüfung abgeschlossen und die Sperre Ihres Kontos aufgehoben.",
      "Sie können wieder Vorschläge für Abende bekommen.",
    ],
    button: { label: "Zu Fermata", url: ctx.appUrl },
  });
}

export function appealReceived(_d: Data, ctx: SafetyMailContext): RenderedMail {
  return mail("safety.appeal_received", "sicherheit_widerspruch", "Wir haben Ihren Widerspruch erhalten", {
    greeting: "Guten Tag,",
    paragraphs: [
      "Ihr Widerspruch ist bei uns eingegangen. Ein Mensch prüft ihn, keine Maschine.",
      "Wir antworten Ihnen per Mail, sobald wir entschieden haben.",
    ],
    button: { label: "Konto ansehen", url: `${ctx.appUrl}/konto/sicherheit` },
  });
}

export function appealDecided(d: Data, ctx: SafetyMailContext): RenderedMail {
  const accepted = d.decision === "accepted";
  return mail("safety.appeal_decided", "sicherheit_widerspruch", "Entscheidung über Ihren Widerspruch", {
    greeting: "Guten Tag,",
    paragraphs: [
      accepted
        ? "wir haben Ihren Widerspruch geprüft und geben Ihnen recht. Die Maßnahme ist aufgehoben."
        : "wir haben Ihren Widerspruch sorgfältig geprüft. Die Maßnahme bleibt bestehen.",
      ...(text(d.note) ? [`Begründung: ${text(d.note)}`] : []),
    ],
    button: { label: "Konto ansehen", url: `${ctx.appUrl}/konto/sicherheit` },
  });
}

export function reportClosed(_d: Data, ctx: SafetyMailContext): RenderedMail {
  return mail("safety.report_closed", "sicherheit_meldung", "Ihre Meldung ist bearbeitet", {
    greeting: "Guten Tag,",
    paragraphs: [
      "wir haben Ihre Meldung geprüft und die Bearbeitung abgeschlossen.",
      "Aus Rücksicht auf alle Beteiligten nennen wir keine Einzelheiten. Wenn noch etwas offen ist oder etwas Neues passiert, melden Sie sich bitte jederzeit wieder.",
    ],
    button: { label: "Hilfe und Kontakte", url: `${ctx.appUrl}/hilfe` },
  });
}

const ADMIN_TITLES: Record<string, string> = {
  meldung: "Neue Meldung",
  vorlaeufige_sperre: "Vorläufige Sperre ausgelöst",
  checkin_hilfe: "Check-in: Ein Mitglied braucht Hilfe",
  checkin_unsicher: "Check-in: Ein Mitglied fühlt sich unsicher",
  widerspruch: "Neuer Widerspruch",
  wiederholt_nicht_erschienen: "Wiederholt nicht erschienen",
  kuendigung_stripe_fehler: "Kündigung: Stripe-Schritt von Hand nachholen",
  widerruf_von_hand: "Widerruf: Kündigung oder Erstattung bei Stripe von Hand nachholen",
};

export function adminAlert(d: Data, ctx: SafetyMailContext): RenderedMail {
  const kind = text(d.kind) ?? "hinweis";
  const severity = text(d.severity) ?? "mittel";
  const title = ADMIN_TITLES[kind] ?? "Neuer Sicherheitshinweis";
  const lines: string[] = [`${title} (Stufe: ${severity}).`];
  if (text(d.category_label)) lines.push(`Art: ${text(d.category_label)}.`);
  if (d.provisional_suspension === true) lines.push("Die gemeldete Person ist vorläufig gesperrt, ihre offenen Abende sind abgesagt.");
  if (text(d.starts_at)) lines.push(`Abend: ${formatDateTime(String(d.starts_at))}${text(d.venue_name) ? `, ${text(d.venue_name)}` : ""}.`);
  if (text(d.due_at)) lines.push(`Ziel für die Prüfung: ${formatDateTime(String(d.due_at))}.`);
  if (kind === "checkin_hilfe") lines.push("Bitte sofort im Admin-Bereich nachsehen und die Person anrufen. Bei Gefahr: 110.");
  return mail("safety.admin_alert", "sicherheit_admin", `[${severity.toUpperCase()}] ${title}`, {
    paragraphs: [...lines, "Namen und Einzelheiten stehen nur im Admin-Bereich (Anmeldung mit Zwei-Faktor)."],
    button: { label: "Im Admin-Bereich öffnen", url: `${ctx.appUrl}/admin/sicherheit` },
  });
}

export const safetyMailTemplates: Record<string, (d: Data, ctx: SafetyMailContext) => RenderedMail> = {
  "safety.report_received": reportReceived,
  "safety.evening_cancelled": eveningCancelled,
  "safety.account_suspended": accountSuspended,
  "safety.sanction_notice": sanctionNotice,
  "safety.sanction_lifted": sanctionLifted,
  "safety.appeal_received": appealReceived,
  "safety.appeal_decided": appealDecided,
  "safety.report_closed": reportClosed,
  "safety.admin_alert": adminAlert,
};
