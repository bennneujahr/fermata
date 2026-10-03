// Nachrichten an Mitglieder rund um einen Abend (M5): Vorschlag, Terminabstimmung, Bestätigung, Absagen,
// Erinnerungen, Check-in, Rückmeldung, Kontakttausch, Nachbesprechung.
// Mails nennen das Gegenüber nicht beim Namen (der Vorname steht nur in der App), Push-Texte nennen keine Namen.
import { renderMail } from "../layout.ts";
import type { EveningContext, NotificationContext } from "../../notify/types.ts";
import { berlinDate, formatDay, formatDayTime, formatShortDayTime, formatTime } from "../../notify/format.ts";
import {
  type Draft,
  form,
  greeting,
  memberFooter,
  paths,
  pushMessage,
  type Rendered,
  type RenderOptions,
  venueLine,
} from "./notify-common.ts";

type EveningRenderer = (ctx: NotificationContext, e: EveningContext, opts: RenderOptions) => Rendered;

function mail(
  ctx: NotificationContext,
  subject: string,
  purpose: string,
  content: { preheader?: string; paragraphs: string[]; button?: { label: string; url: string }; after?: string[] },
): Draft {
  const f = ctx.recipient.address_form;
  const { html, text } = renderMail({
    preheader: content.preheader,
    greeting: greeting(f, ctx.recipient.name),
    paragraphs: content.paragraphs,
    button: content.button,
    after: content.after,
    footer: memberFooter(f),
  });
  return { subject, html, text, template: ctx.template, purpose };
}

function timesList(times: string[]): string[] {
  return times.map((t) => `– ${formatDayTime(t)}`);
}

function deadlineText(e: EveningContext): string | null {
  return e.deadline_at ? formatDayTime(e.deadline_at) : null;
}

function whereLines(ctx: NotificationContext, e: EveningContext): string[] {
  const t = form(ctx.recipient.address_form);
  const lines = [`Wo: ${venueLine(e.venue)}`];
  if (e.venue?.public_transport) lines.push(`Anfahrt: ${e.venue.public_transport}`);
  if (e.venue?.accessibility) lines.push(`Barrierefreiheit: ${e.venue.accessibility}`);
  lines.push(t(
    `Der Tisch ist auf den Namen „${e.reservation_name}“ reserviert. Ab ${e.find_before_minutes} Minuten vor Beginn zeigt Ihnen die App den Tisch-Code und den Vornamen Ihres Gegenübers.`,
    `Der Tisch ist auf den Namen „${e.reservation_name}“ reserviert. Ab ${e.find_before_minutes} Minuten vor Beginn zeigt dir die App den Tisch-Code und den Vornamen deines Gegenübers.`,
  ));
  return lines;
}

const proposed: EveningRenderer = (ctx, e, opts) => {
  const t = form(ctx.recipient.address_form);
  const until = deadlineText(e);
  const paragraphs = [
    t("wir haben einen Vorschlag für einen Abend für Sie.", "wir haben einen Vorschlag für einen Abend für dich."),
  ];
  if (e.reasons_text) paragraphs.push(`${t("Warum Sie beide", "Warum ihr beide")}: ${e.reasons_text}`);
  paragraphs.push(`Wo: ${venueLine(e.venue)}`);
  if (e.offered_times.length) paragraphs.push("Mögliche Zeiten:", ...timesList(e.offered_times));
  paragraphs.push(t(
    "Wählen Sie bis zu drei Zeiten, die Ihnen passen. Sie können auch eine eigene Zeit vorschlagen, wenn sie in Ihre gemeinsamen freien Zeiten passt. Wenn der Vorschlag nicht passt, können Sie ihn ablehnen.",
    "Wähle bis zu drei Zeiten, die dir passen. Du kannst auch eine eigene Zeit vorschlagen, wenn sie in eure gemeinsamen freien Zeiten passt. Wenn der Vorschlag nicht passt, kannst du ihn ablehnen.",
  ));
  const after = until
    ? [
      t(
        `Bitte antworten Sie bis ${until}. Danach ist der Vorschlag beendet.`,
        `Bitte antworte bis ${until}. Danach ist der Vorschlag beendet.`,
      ),
    ]
    : [];
  return {
    mail: mail(ctx, "Vorschlag für einen Abend", "Vorschlag mit Frist", {
      preheader: t(
        "Ein Vorschlag für einen Abend wartet auf Ihre Antwort.",
        "Ein Vorschlag für einen Abend wartet auf deine Antwort.",
      ),
      paragraphs,
      button: { label: "Vorschlag ansehen", url: opts.appUrl + paths.evening(e.id) },
      after,
    }),
    push: pushMessage(
      ctx,
      until
        ? `Ein Vorschlag für einen Abend. Antwort bis ${formatShortDayTime(e.deadline_at!)}.`
        : "Ein Vorschlag für einen Abend.",
      paths.evening(e.id),
      `abend-${e.id}`,
    ),
  };
};

const timeRequested: EveningRenderer = (ctx, e, opts) => {
  const t = form(ctx.recipient.address_form);
  const until = deadlineText(e);
  const paragraphs = [
    t(
      `Ihr Gegenüber hat Wunschzeiten für den Abend gewählt (${e.venue?.name ?? "Lokal"}):`,
      `dein Gegenüber hat Wunschzeiten für den Abend gewählt (${e.venue?.name ?? "Lokal"}):`,
    ),
    ...timesList(e.offered_times),
    t(
      "Bitte bestätigen Sie eine dieser Zeiten oder schlagen Sie eine andere vor.",
      "Bitte bestätige eine dieser Zeiten oder schlage eine andere vor.",
    ),
  ];
  return {
    mail: mail(ctx, t("Wunschzeiten für Ihren Abend", "Wunschzeiten für deinen Abend"), "Terminabstimmung mit Frist", {
      paragraphs,
      button: { label: "Zeit wählen", url: opts.appUrl + paths.evening(e.id) },
      after: until ? [t(`Ihre Antwort brauchen wir bis ${until}.`, `Deine Antwort brauchen wir bis ${until}.`)] : [],
    }),
    push: pushMessage(
      ctx,
      until
        ? `Wunschzeiten für den Abend. Antwort bis ${formatShortDayTime(e.deadline_at!)}.`
        : "Wunschzeiten für den Abend.",
      paths.evening(e.id),
      `abend-${e.id}`,
    ),
  };
};

const timeCountered: EveningRenderer = (ctx, e, opts) => {
  const t = form(ctx.recipient.address_form);
  const until = deadlineText(e);
  return {
    mail: mail(
      ctx,
      t("Eine andere Uhrzeit für Ihren Abend", "Eine andere Uhrzeit für deinen Abend"),
      "Terminabstimmung mit Frist",
      {
        paragraphs: [
          t("Ihr Gegenüber schlägt eine andere Uhrzeit vor:", "dein Gegenüber schlägt eine andere Uhrzeit vor:"),
          ...timesList(e.offered_times),
          t(
            "Bitte bestätigen Sie eine dieser Zeiten oder schlagen Sie eine andere vor.",
            "Bitte bestätige eine dieser Zeiten oder schlage eine andere vor.",
          ),
        ],
        button: { label: "Zeit wählen", url: opts.appUrl + paths.evening(e.id) },
        after: until ? [t(`Ihre Antwort brauchen wir bis ${until}.`, `Deine Antwort brauchen wir bis ${until}.`)] : [],
      },
    ),
    push: pushMessage(
      ctx,
      until
        ? `Eine andere Uhrzeit für den Abend. Antwort bis ${formatShortDayTime(e.deadline_at!)}.`
        : "Eine andere Uhrzeit für den Abend.",
      paths.evening(e.id),
      `abend-${e.id}`,
    ),
  };
};

const deadlineReminder: EveningRenderer = (ctx, e, opts) => {
  const t = form(ctx.recipient.address_form);
  const at = (ctx.payload.deadline_at as string | undefined) ?? e.deadline_at;
  const until = at ? formatDayTime(at) : null;
  return {
    mail: mail(
      ctx,
      t("Erinnerung: Ihr Abend wartet auf Ihre Antwort", "Erinnerung: dein Abend wartet auf deine Antwort"),
      "Erinnerung vor Fristende",
      {
        paragraphs: [
          until
            ? t(
              `für den Abend im Lokal ${e.venue?.name ?? ""} brauchen wir bis ${until} Ihre Antwort.`,
              `für den Abend im Lokal ${e.venue?.name ?? ""} brauchen wir bis ${until} deine Antwort.`,
            )
            : t("für Ihren Abend brauchen wir noch Ihre Antwort.", "für deinen Abend brauchen wir noch deine Antwort."),
          "Danach ist der Vorschlag beendet.",
        ],
        button: { label: "Zum Abend", url: opts.appUrl + paths.evening(e.id) },
      },
    ),
    push: pushMessage(
      ctx,
      at ? `Der Abend wartet auf Antwort, bis ${formatShortDayTime(at)}.` : "Der Abend wartet auf Antwort.",
      paths.evening(e.id),
      `abend-${e.id}`,
    ),
  };
};

const confirmed: EveningRenderer = (ctx, e, opts) => {
  const t = form(ctx.recipient.address_form);
  if (!e.starts_at) return { mail: null, push: null };
  const paragraphs = [
    t("Ihr Abend ist bestätigt.", "dein Abend ist bestätigt."),
    `Wann: ${formatDayTime(e.starts_at)}`,
    ...whereLines(ctx, e),
  ];
  const after = e.late_cancel_from
    ? [t(
      `Wenn Sie absagen müssen, tun Sie es bitte bis ${
        formatDayTime(e.late_cancel_from)
      }. Spätere Absagen gelten als kurzfristig.`,
      `Wenn du absagen musst, tu es bitte bis ${
        formatDayTime(e.late_cancel_from)
      }. Spätere Absagen gelten als kurzfristig.`,
    )]
    : [];
  return {
    mail: mail(ctx, `${t("Ihr", "Dein")} Abend steht: ${formatDayTime(e.starts_at)}`, "Bestätigung des Abends", {
      paragraphs,
      button: { label: "Abend ansehen", url: opts.appUrl + paths.evening(e.id) },
      after,
    }),
    push: pushMessage(
      ctx,
      `Der Abend steht: ${formatShortDayTime(e.starts_at)}.`,
      paths.evening(e.id),
      `abend-${e.id}`,
    ),
  };
};

const declined: EveningRenderer = (ctx, e, opts) => {
  const t = form(ctx.recipient.address_form);
  return {
    mail: mail(ctx, "Aus dem Vorschlag wird diesmal kein Abend", "Vorschlag beendet", {
      paragraphs: [
        t(
          `aus dem Vorschlag für einen Abend im Lokal ${
            e.venue?.name ?? ""
          } wird diesmal nichts. Gründe nennen wir dabei nie.`,
          `aus dem Vorschlag für einen Abend im Lokal ${
            e.venue?.name ?? ""
          } wird diesmal nichts. Gründe nennen wir dabei nie.`,
        ),
        t("Sie bleiben für die nächsten Vorschläge dabei.", "Du bleibst für die nächsten Vorschläge dabei."),
      ],
      button: { label: "Zur Übersicht", url: opts.appUrl + "/abende" },
    }),
    push: pushMessage(ctx, "Aus dem Vorschlag wird diesmal kein Abend.", paths.evening(e.id), `abend-${e.id}`),
  };
};

const lapsed: EveningRenderer = (ctx, e, opts) => {
  const t = form(ctx.recipient.address_form);
  return {
    mail: mail(ctx, "Der Vorschlag ist beendet", "Frist abgelaufen", {
      paragraphs: [
        `für den Vorschlag im Lokal ${
          e.venue?.name ?? ""
        } ist die Frist abgelaufen, bevor eine Uhrzeit feststand. Damit ist der Vorschlag beendet.`,
        t("Sie bleiben für die nächsten Vorschläge dabei.", "Du bleibst für die nächsten Vorschläge dabei."),
      ],
      button: { label: "Zur Übersicht", url: opts.appUrl + "/abende" },
    }),
    push: pushMessage(ctx, "Der Vorschlag für einen Abend ist beendet.", paths.evening(e.id), `abend-${e.id}`),
  };
};

const cancelled: EveningRenderer = (ctx, e, opts) => {
  const t = form(ctx.recipient.address_form);
  const when = e.starts_at ? formatDayTime(e.starts_at) : "";
  const byFermata = ctx.payload.by === "fermata";
  return {
    mail: mail(
      ctx,
      `${t("Ihr", "Dein")} Abend am ${e.starts_at ? formatDay(e.starts_at) : ""} findet nicht statt`,
      "Absage",
      {
        paragraphs: [
          byFermata
            ? t(
              `wir mussten den Abend am ${when} im Lokal ${e.venue?.name ?? ""} absagen. Das tut uns leid.`,
              `wir mussten den Abend am ${when} im Lokal ${e.venue?.name ?? ""} absagen. Das tut uns leid.`,
            )
            : t(
              `Ihr Gegenüber hat den Abend am ${when} im Lokal ${e.venue?.name ?? ""} abgesagt.`,
              `dein Gegenüber hat den Abend am ${when} im Lokal ${e.venue?.name ?? ""} abgesagt.`,
            ),
          t(
            "Den Tisch haben wir freigegeben. Sie müssen nichts weiter tun.",
            "Den Tisch haben wir freigegeben. Du musst nichts weiter tun.",
          ),
        ],
        button: { label: "Zur Übersicht", url: opts.appUrl + "/abende" },
      },
    ),
    push: pushMessage(
      ctx,
      e.starts_at
        ? `Der Abend am ${formatShortDayTime(e.starts_at)} findet nicht statt.`
        : "Ein Abend findet nicht statt.",
      paths.evening(e.id),
      `abend-${e.id}`,
    ),
  };
};

const cancelReceipt: EveningRenderer = (ctx, e, opts) => {
  const t = form(ctx.recipient.address_form);
  const when = e.starts_at ? formatDayTime(e.starts_at) : "";
  const late = ctx.payload.late === true;
  const paragraphs = [
    t(
      `Ihre Absage für den Abend am ${when} ist angekommen. Wir haben Ihr Gegenüber und das Lokal informiert.`,
      `deine Absage für den Abend am ${when} ist angekommen. Wir haben dein Gegenüber und das Lokal informiert.`,
    ),
  ];
  if (late) {
    paragraphs.push(
      `Die Absage kam weniger als ${e.late_cancel_hours} Stunden vor Beginn und gilt deshalb als kurzfristig.`,
    );
  }
  return {
    mail: mail(ctx, t("Ihre Absage ist angekommen", "Deine Absage ist angekommen"), "Eingangsbestätigung Absage", {
      paragraphs,
      button: { label: "Zur Übersicht", url: opts.appUrl + "/abende" },
    }),
    push: null,
  };
};

const reminder: EveningRenderer = (ctx, e, opts) => {
  const t = form(ctx.recipient.address_form);
  if (!e.starts_at) return { mail: null, push: null };
  const hours = Number(ctx.payload.hours_before ?? 0);
  const today = berlinDate(new Date(Date.parse(e.starts_at) - hours * 3600_000)) === berlinDate(e.starts_at);
  const lead = today ? `Heute um ${formatTime(e.starts_at)}` : `Morgen um ${formatTime(e.starts_at)}`;
  const leadLower = lead.charAt(0).toLowerCase() + lead.slice(1);
  const paragraphs = [
    t(`${leadLower} ist Ihr Abend.`, `${leadLower} ist dein Abend.`),
    `Wann: ${formatDayTime(e.starts_at)}`,
    ...whereLines(ctx, e),
    t(
      "Wenn Sie mögen, hinterlegen Sie in der App ein Erkennungszeichen, zum Beispiel „dunkelblauer Schal“.",
      "Wenn du magst, hinterlege in der App ein Erkennungszeichen, zum Beispiel „dunkelblauer Schal“.",
    ),
    t(
      "Teilen Sie Ort und Zeit gern mit einer Vertrauensperson.",
      "Teile Ort und Zeit gern mit einer Vertrauensperson.",
    ),
  ];
  return {
    mail: mail(ctx, `${lead}: ${t("Ihr", "dein")} Abend im Lokal ${e.venue?.name ?? ""}`, "Erinnerung an den Abend", {
      paragraphs,
      button: { label: "Abend ansehen", url: opts.appUrl + paths.evening(e.id) },
    }),
    push: pushMessage(ctx, `${lead}: der Abend.`, paths.evening(e.id), `abend-${e.id}`),
  };
};

const checkin: EveningRenderer = (ctx, e, opts) => {
  const t = form(ctx.recipient.address_form);
  const s = ctx.safety;
  const help = s
    ? t(
      `Wenn Sie Hilfe brauchen: Notruf ${s.emergency_number}. Das Heimwegtelefon erreichen Sie unter ${s.heimwegtelefon_number} (${s.heimwegtelefon_hours}).`,
      `Wenn du Hilfe brauchst: Notruf ${s.emergency_number}. Das Heimwegtelefon erreichst du unter ${s.heimwegtelefon_number} (${s.heimwegtelefon_hours}).`,
    )
    : t("Wenn Sie Hilfe brauchen: Notruf 110.", "Wenn du Hilfe brauchst: Notruf 110.");
  return {
    mail: mail(ctx, "Ist alles in Ordnung?", "Check-in (Sicherheit)", {
      paragraphs: [
        t(
          "Ihr Abend hat vor einer halben Stunde begonnen. Ist alles in Ordnung? Ein Tipp in der App genügt.",
          "dein Abend hat vor einer halben Stunde begonnen. Ist alles in Ordnung? Ein Tipp in der App genügt.",
        ),
        help,
      ],
      button: { label: "Alles in Ordnung", url: opts.appUrl + paths.checkin(e.id) },
    }),
    push: pushMessage(ctx, "Ist alles in Ordnung? Kurz in der App bestätigen.", paths.checkin(e.id), `checkin-${e.id}`),
  };
};

const feedbackRequest: EveningRenderer = (ctx, e, opts) => {
  const t = form(ctx.recipient.address_form);
  const paragraphs = [
    t(
      `wie war Ihr Abend im Lokal ${
        e.venue?.name ?? ""
      }? Die Rückmeldung dauert etwa zwei Minuten. Ihr Gegenüber sieht sie nie.`,
      `wie war dein Abend im Lokal ${
        e.venue?.name ?? ""
      }? Die Rückmeldung dauert etwa zwei Minuten. Dein Gegenüber sieht sie nie.`,
    ),
    t(
      "Dabei können Sie angeben, ob Sie Kontaktdaten austauschen möchten. Das passiert nur, wenn Sie beide Ja sagen.",
      "Dabei kannst du angeben, ob du Kontaktdaten austauschen möchtest. Das passiert nur, wenn ihr beide Ja sagt.",
    ),
  ];
  return {
    mail: mail(ctx, t("Wie war Ihr Abend?", "Wie war dein Abend?"), "Bitte um Rückmeldung", {
      paragraphs,
      button: { label: "Rückmeldung geben", url: opts.appUrl + paths.feedback(e.id) },
      after: e.feedback_until ? [`Die Rückmeldung ist bis ${formatDayTime(e.feedback_until)} möglich.`] : [],
    }),
    push: pushMessage(
      ctx,
      t(
        "Wie war Ihr Abend? Die Rückmeldung sieht nur Fermata.",
        "Wie war dein Abend? Die Rückmeldung sieht nur Fermata.",
      ),
      paths.feedback(e.id),
      `rueckmeldung-${e.id}`,
    ),
  };
};

// Neutral: verrät nicht, was das Gegenüber angegeben hat (Rückmeldungen sieht das Gegenüber nie).
const feedbackNeeded: EveningRenderer = (ctx, e, opts) => {
  const t = form(ctx.recipient.address_form);
  const until = typeof ctx.payload.respond_until === "string" ? formatDayTime(ctx.payload.respond_until) : null;
  return {
    mail: mail(
      ctx,
      t("Ihre Rückmeldung zum Abend fehlt noch", "Deine Rückmeldung zum Abend fehlt noch"),
      "Rückmeldung mit Frist",
      {
        paragraphs: [
          t(
            `zu Ihrem Abend am ${e.starts_at ? formatDayTime(e.starts_at) : ""} fehlt uns noch Ihre Rückmeldung.`,
            `zu deinem Abend am ${e.starts_at ? formatDayTime(e.starts_at) : ""} fehlt uns noch deine Rückmeldung.`,
          ),
          until
            ? t(
              `Bitte geben Sie sie bis ${until}. Ohne Rückmeldung entscheiden wir mit den Angaben, die uns vorliegen.`,
              `Bitte gib sie bis ${until}. Ohne Rückmeldung entscheiden wir mit den Angaben, die uns vorliegen.`,
            )
            : "Ohne Rückmeldung entscheiden wir mit den Angaben, die uns vorliegen.",
        ],
        button: { label: "Rückmeldung geben", url: opts.appUrl + paths.feedback(e.id) },
      },
    ),
    push: pushMessage(
      ctx,
      typeof ctx.payload.respond_until === "string"
        ? `Die Rückmeldung zum Abend fehlt noch, bitte bis ${formatShortDayTime(ctx.payload.respond_until)}.`
        : "Die Rückmeldung zum Abend fehlt noch.",
      paths.feedback(e.id),
      `rueckmeldung-${e.id}`,
    ),
  };
};

// Kontaktdaten stehen nur in der App, nie in der Mail (Datensparsamkeit).
const contactReleased: EveningRenderer = (ctx, e, opts) => {
  const t = form(ctx.recipient.address_form);
  return {
    mail: mail(ctx, "Kontaktdaten freigegeben", "Kontakttausch", {
      paragraphs: [
        t(
          "Sie haben beide Ja gesagt. Die Kontaktdaten, die Ihr Gegenüber freigegeben hat, sehen Sie jetzt in der App.",
          "ihr habt beide Ja gesagt. Die Kontaktdaten, die dein Gegenüber freigegeben hat, siehst du jetzt in der App.",
        ),
        t(
          "Wie es weitergeht, entscheiden Sie beide selbst. Fermata ist dabei nicht mehr beteiligt.",
          "Wie es weitergeht, entscheidet ihr beide selbst. Fermata ist dabei nicht mehr beteiligt.",
        ),
      ],
      button: { label: "Kontaktdaten ansehen", url: opts.appUrl + paths.contact(e.id) },
    }),
    push: pushMessage(
      ctx,
      t(
        "Sie haben beide Ja gesagt. Die Kontaktdaten stehen in der App.",
        "Ihr habt beide Ja gesagt. Die Kontaktdaten stehen in der App.",
      ),
      paths.contact(e.id),
      `kontakt-${e.id}`,
    ),
  };
};

const debriefOffer: EveningRenderer = (ctx, e, opts) => {
  const t = form(ctx.recipient.address_form);
  const minutes = Number(ctx.payload.minutes ?? 0);
  const until = typeof ctx.payload.offer_until === "string" ? formatDayTime(ctx.payload.offer_until) : null;
  return {
    mail: mail(
      ctx,
      t("Möchten Sie über den Abend sprechen?", "Möchtest du über den Abend sprechen?"),
      "Angebot Nachbesprechung",
      {
        paragraphs: [
          t(
            `wenn Sie mögen, sprechen Sie etwa ${minutes} Minuten mit Viola über den Abend. Viola ist eine KI.`,
            `wenn du magst, sprich etwa ${minutes} Minuten mit Viola über den Abend. Viola ist eine KI.`,
          ),
          t(
            "Was Sie erzählen, fließt in Ihre nächsten Vorschläge ein. Ihr Gegenüber erfährt davon nichts.",
            "Was du erzählst, fließt in deine nächsten Vorschläge ein. Dein Gegenüber erfährt davon nichts.",
          ),
        ],
        button: { label: "Nachbesprechung starten", url: opts.appUrl + paths.debrief(e.id) },
        after: until ? [`Das Angebot gilt bis ${until}.`] : [],
      },
    ),
    push: pushMessage(
      ctx,
      t("Möchten Sie kurz über den Abend sprechen?", "Möchtest du kurz über den Abend sprechen?"),
      paths.debrief(e.id),
      `nachbesprechung-${e.id}`,
    ),
  };
};

export const eveningTemplates: Record<string, EveningRenderer> = {
  "evening.proposed": proposed,
  "evening.time_requested": timeRequested,
  "evening.time_countered": timeCountered,
  "evening.deadline_reminder": deadlineReminder,
  "evening.confirmed": confirmed,
  "evening.declined": declined,
  "evening.lapsed": lapsed,
  "evening.cancelled": cancelled,
  "evening.cancel_receipt": cancelReceipt,
  "evening.reminder": reminder,
  "evening.checkin": checkin,
  "evening.feedback_request": feedbackRequest,
  "evening.feedback_needed": feedbackNeeded,
  "evening.contact_released": contactReleased,
  "evening.debrief_offer": debriefOffer,
};
