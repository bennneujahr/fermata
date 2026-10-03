// Einstieg für alle Nachrichten aus ops.notification_queue (M5): wählt die Vorlage nach der Kennung und
// liefert Mail und Push-Text. Zeitenabfrage-Vorlagen stehen hier, Abend-Vorlagen in evening.ts,
// Lokal- und Admin-Vorlagen in evening-venue.ts.
import { renderMail } from "../layout.ts";
import type { NotificationContext } from "../../notify/types.ts";
import { formatDateOnly, formatDayTime, formatShortDayTime } from "../../notify/format.ts";
import { eveningTemplates } from "./evening.ts";
import { venueCancellation, venueReservation, venueUnconfirmed } from "./evening-venue.ts";
import { form, greeting, memberFooter, paths, pushMessage, type Rendered, type RenderOptions } from "./notify-common.ts";

export type { Draft, Rendered, RenderOptions } from "./notify-common.ts";

function availabilityRequest(ctx: NotificationContext, opts: RenderOptions): Rendered {
  const p = ctx.period!;
  const f = ctx.recipient.address_form;
  const t = form(f);
  const range = `${formatDateOnly(p.starts_on)} bis ${formatDateOnly(p.ends_on)}`;
  const until = formatDayTime(p.answer_until);
  const { html, text } = renderMail({
    preheader: t("Wann haben Sie in den nächsten Wochen Zeit?", "Wann hast du in den nächsten Wochen Zeit?"),
    greeting: greeting(f, ctx.recipient.name),
    paragraphs: [
      t(`für den nächsten Durchgang fragen wir Ihre freien Abende ab: ${range}.`,
        `für den nächsten Durchgang fragen wir deine freien Abende ab: ${range}.`),
      t("Tragen Sie bitte ein, wann Sie Zeit haben. Einen Abend schlagen wir nur zu Zeiten vor, die bei Ihnen beiden frei sind.",
        "Trag bitte ein, wann du Zeit hast. Einen Abend schlagen wir nur zu Zeiten vor, die bei euch beiden frei sind."),
    ],
    button: { label: "Freie Abende eintragen", url: opts.appUrl + paths.availability(p.id) },
    after: [
      t(`Das geht bis ${until}.`, `Das geht bis ${until}.`),
      t("Wenn Sie in diesem Zeitraum keine Zeit haben, müssen Sie nichts tun.",
        "Wenn du in diesem Zeitraum keine Zeit hast, musst du nichts tun."),
    ],
    footer: memberFooter(f),
  });
  return {
    mail: {
      subject: t("Wann haben Sie Zeit?", "Wann hast du Zeit?"),
      html,
      text,
      template: ctx.template,
      purpose: "Zeitenabfrage mit Frist",
    },
    push: pushMessage(ctx, `Freie Abende bitte bis ${formatShortDayTime(p.answer_until)} eintragen.`, paths.availability(p.id),
      `zeiten-${p.id}`),
  };
}

function availabilityReminder(ctx: NotificationContext, opts: RenderOptions): Rendered {
  const p = ctx.period!;
  const f = ctx.recipient.address_form;
  const t = form(f);
  const until = formatDayTime(p.answer_until);
  const { html, text } = renderMail({
    greeting: greeting(f, ctx.recipient.name),
    paragraphs: [
      t(`für ${formatDateOnly(p.starts_on)} bis ${formatDateOnly(p.ends_on)} haben Sie noch keine freien Abende eingetragen. Das geht noch bis ${until}.`,
        `für ${formatDateOnly(p.starts_on)} bis ${formatDateOnly(p.ends_on)} hast du noch keine freien Abende eingetragen. Das geht noch bis ${until}.`),
      t("Wenn Sie in diesem Zeitraum keine Zeit haben, müssen Sie nichts tun.",
        "Wenn du in diesem Zeitraum keine Zeit hast, musst du nichts tun."),
    ],
    button: { label: "Freie Abende eintragen", url: opts.appUrl + paths.availability(p.id) },
    footer: memberFooter(f),
  });
  return {
    mail: { subject: "Erinnerung: freie Abende eintragen", html, text, template: ctx.template, purpose: "Erinnerung Zeitenabfrage" },
    push: pushMessage(ctx, `Freie Abende noch bis ${formatShortDayTime(p.answer_until)} eintragen.`, paths.availability(p.id),
      `zeiten-${p.id}`),
  };
}

/** Mail und Push für eine Nachricht. Unbekannte Vorlagen oder fehlende Daten: nichts (Versand überspringt). */
export function renderNotification(ctx: NotificationContext, opts: RenderOptions): Rendered {
  const none: Rendered = { mail: null, push: null };
  switch (ctx.template) {
    case "availability.request":
      return ctx.period ? availabilityRequest(ctx, opts) : none;
    case "availability.reminder":
      return ctx.period ? availabilityReminder(ctx, opts) : none;
    case "venue.reservation":
      return ctx.reservation ? venueReservation(ctx, ctx.reservation, opts) : none;
    case "venue.cancellation":
      return ctx.reservation ? venueCancellation(ctx, ctx.reservation, opts) : none;
    case "admin.venue_unconfirmed":
      return ctx.reservation ? venueUnconfirmed(ctx, ctx.reservation, opts) : none;
  }
  const evening = eveningTemplates[ctx.template];
  if (evening && ctx.evening) return evening(ctx, ctx.evening, opts);
  return none;
}

/** Alle Vorlagen-Kennungen, die hier Text haben (für Tests und Dokumentation). */
export const knownTemplates: string[] = [
  "availability.request",
  "availability.reminder",
  "venue.reservation",
  "venue.cancellation",
  "admin.venue_unconfirmed",
  ...Object.keys(eveningTemplates),
];
