// Nachrichten an Partner-Lokale (Reservierung, Absage) und an Benn (telefonisch reservieren, Lokal hat nicht
// bestätigt) sowie die Texte der Bestätigungsseite (venue-confirm). Nie Nachnamen oder Kontaktdaten der Mitglieder.
import { renderMail } from "../layout.ts";
import type { NotificationContext, ReservationContext } from "../../notify/types.ts";
import { formatDay, formatDayTime, formatTime } from "../../notify/format.ts";
import type { Draft, Rendered, RenderOptions } from "./notify-common.ts";
import { escapeHtml as esc, htmlPage as page } from "../../notify/html.ts";

function venueGreeting(r: ReservationContext, ctx: NotificationContext): string {
  if (ctx.recipient.kind === "admin") return "Hallo,";
  return r.venue.contact_name ? `Guten Tag, ${r.venue.contact_name},` : "Guten Tag,";
}

function reservationLines(r: ReservationContext): string[] {
  const lines = [
    `Datum: ${formatDay(r.starts_at)}`,
    `Uhrzeit: ${formatTime(r.starts_at)}`,
    `Name der Reservierung: ${r.reservation_name}`,
    `Tisch-Code: ${r.table_code}`,
    `Personen: ${r.persons}`,
  ];
  if (r.notes) lines.push(`Hinweis: ${r.notes}`);
  return lines;
}

function draft(ctx: NotificationContext, subject: string, purpose: string, c: {
  paragraphs: string[];
  button?: { label: string; url: string };
  after?: string[];
}, r: ReservationContext): Draft {
  const { html, text } = renderMail({
    greeting: venueGreeting(r, ctx),
    paragraphs: c.paragraphs,
    button: c.button,
    after: c.after,
    footer: ["Fermata · Verabredungen in Partner-Lokalen."],
  });
  return { subject, html, text, template: ctx.template, purpose };
}

function manualHint(r: ReservationContext): string {
  const phone = r.venue.contact_phone ? ` unter ${r.venue.contact_phone}` : "";
  return `Das Lokal ${r.venue.name} reserviert nicht per E-Mail. Bitte dort${phone} anrufen und so reservieren:`;
}

export function venueReservation(ctx: NotificationContext, r: ReservationContext, opts: RenderOptions): Rendered {
  const admin = ctx.recipient.kind === "admin";
  const paragraphs = admin ? [manualHint(r), ...reservationLines(r)] : [
    `wir möchten bei Ihnen einen Tisch für ${r.persons} Personen reservieren.`,
    ...reservationLines(r),
    `Die beiden Gäste nennen am Abend den Namen „${r.reservation_name}“ und den Tisch-Code.`,
  ];
  const after = admin ? [] : opts.venueConfirmUrl ? ["Wenn etwas nicht passt, antworten Sie bitte auf diese Mail."] : [
    "Bitte bestätigen Sie die Reservierung kurz mit einer Antwort auf diese Mail. Wenn etwas nicht passt, schreiben Sie es uns bitte ebenso.",
  ];
  return {
    mail: draft(
      ctx,
      admin
        ? `Bitte telefonisch reservieren: ${r.venue.name}, ${formatDayTime(r.starts_at)}`
        : `Reservierung für ${r.persons} Personen am ${formatDay(r.starts_at)}, ${
          formatTime(r.starts_at)
        } (Fermata ${r.table_code})`,
      admin ? "Reservierung von Hand" : "Reservierung beim Lokal",
      {
        paragraphs,
        button: !admin && opts.venueConfirmUrl
          ? { label: "Reservierung bestätigen", url: opts.venueConfirmUrl }
          : undefined,
        after,
      },
      r,
    ),
    push: null,
  };
}

export function venueCancellation(ctx: NotificationContext, r: ReservationContext, _opts: RenderOptions): Rendered {
  const admin = ctx.recipient.kind === "admin";
  const paragraphs = admin
    ? [
      `Bitte beim Lokal ${r.venue.name}${r.venue.contact_phone ? ` (${r.venue.contact_phone})` : ""} absagen:`,
      ...reservationLines(r),
    ]
    : [
      `die Reservierung für ${r.persons} Personen am ${formatDay(r.starts_at)} um ${
        formatTime(r.starts_at)
      } unter dem Namen „${r.reservation_name}“ (Tisch-Code ${r.table_code}) brauchen wir nicht mehr. Bitte geben Sie den Tisch frei.`,
      "Danke für Ihr Verständnis.",
    ];
  return {
    mail: draft(
      ctx,
      admin
        ? `Bitte telefonisch absagen: ${r.venue.name}, ${formatDayTime(r.starts_at)}`
        : `Absage der Reservierung am ${formatDay(r.starts_at)}, ${formatTime(r.starts_at)} (Fermata ${r.table_code})`,
      admin ? "Absage von Hand" : "Absage beim Lokal",
      { paragraphs },
      r,
    ),
    push: null,
  };
}

export function venueUnconfirmed(ctx: NotificationContext, r: ReservationContext, _opts: RenderOptions): Rendered {
  return {
    mail: draft(
      ctx,
      `Lokal hat noch nicht bestätigt: ${r.venue.name}, ${formatDayTime(r.starts_at)}`,
      "Hinweis an Admin",
      {
        paragraphs: [
          `${r.venue.name} hat die Reservierung noch nicht bestätigt.`,
          ...reservationLines(r),
          r.venue.contact_phone
            ? `Telefon des Lokals: ${r.venue.contact_phone}`
            : "Für das Lokal ist keine Telefonnummer hinterlegt.",
        ],
      },
      r,
    ),
    push: null,
  };
}

// ---------------------------------------------------------------------------
// Bestätigungsseite für das Lokal (Edge Function venue-confirm)
// ---------------------------------------------------------------------------
export interface VenueSummary {
  venue_name: string;
  starts_at: string;
  table_code: string;
  reservation_name: string;
  persons: number;
  status: string;
  venue_confirmed_at: string | null;
}

function summaryList(s: VenueSummary): string {
  const items = [
    `Datum: ${formatDay(s.starts_at)}`,
    `Uhrzeit: ${formatTime(s.starts_at)}`,
    `Name der Reservierung: ${s.reservation_name}`,
    `Tisch-Code: ${s.table_code}`,
    `Personen: ${s.persons}`,
  ];
  return `<p style="font-size:16px;line-height:1.6;">${
    esc(s.venue_name)
  }</p><ul style="font-size:16px;line-height:1.8;">${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;
}

export function venueConfirmPage(s: VenueSummary, token: string): string {
  if (s.status !== "reserved") {
    return page(
      "Diese Reservierung wurde abgesagt",
      `${summaryList(s)}<p style="font-size:16px;">Sie müssen nichts weiter tun.</p>`,
    );
  }
  if (s.venue_confirmed_at) {
    return page(
      "Die Reservierung ist bestätigt",
      `${summaryList(s)}<p style="font-size:16px;">Danke. Sie müssen nichts weiter tun.</p>`,
    );
  }
  return page(
    "Reservierung bestätigen",
    `${summaryList(s)}
<form method="post">
<input type="hidden" name="t" value="${esc(token)}">
<button type="submit" style="background:#7A2638;color:#FBF8F2;border:none;padding:14px 22px;border-radius:999px;font-size:16px;cursor:pointer;">Reservierung bestätigen</button>
</form>
<p style="font-size:14px;color:#625B70;margin-top:24px;">Wenn etwas nicht passt, antworten Sie bitte auf die Mail zur Reservierung.</p>`,
  );
}

export function venueConfirmedPage(s: VenueSummary): string {
  return page(
    "Danke, die Reservierung ist bestätigt",
    `${summaryList(s)}<p style="font-size:16px;">Sie müssen nichts weiter tun.</p>`,
  );
}

export function venueLinkInvalidPage(): string {
  return page(
    "Dieser Link gilt nicht mehr",
    `<p style="font-size:16px;line-height:1.6;">Der Link ist ungültig oder abgelaufen. Bitte antworten Sie einfach auf die Mail zur Reservierung.</p>`,
  );
}
