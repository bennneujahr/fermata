// Mails der Warteliste (M1). Ruhiger Ton, Sie-Form, keine Werbung in der Bestätigungs-Mail (PLAN 2.3 Nr. 1).
// Jede Funktion liefert eine fertige MailMessage ohne Empfänger; die Edge Function ergänzt "to".
import { renderMail } from "../layout.ts";
import type { MailMessage } from "../types.ts";

type Draft = Omit<MailMessage, "to">;

const REGION_LABELS: Record<string, string> = {
  westmecklenburg: "Westmecklenburg",
  hamburg: "Hamburg",
  luebeck: "Lübeck",
  rostock: "Rostock",
  anderswo: "weitere Regionen",
};

export function regionLabel(regionGroup: string): string {
  return REGION_LABELS[regionGroup] ?? "weitere Regionen";
}

function greeting(firstName: string): string {
  return `Guten Tag, ${firstName},`;
}

/** Bestätigungs-Mail (Double-Opt-in). Bewusst ohne Werbung, nur der Zweck der Mail. */
export function waitlistConfirmMail(p: { firstName: string; confirmUrl: string; validHours: number; retentionDays: number }): Draft {
  const { html, text } = renderMail({
    preheader: "Ein Klick, dann stehen Sie auf der Warteliste.",
    greeting: greeting(p.firstName),
    paragraphs: [
      "Sie haben sich für die Warteliste von Fermata eingetragen. Bitte bestätigen Sie Ihre E-Mail-Adresse. Erst danach bekommen Sie einen Platz.",
    ],
    button: { label: "Anmeldung bestätigen", url: p.confirmUrl },
    after: [
      `Der Link gilt ${p.validHours} Stunden.`,
      `Wenn Sie sich nicht eingetragen haben, müssen Sie nichts tun. Ohne Bestätigung löschen wir die Angaben nach ${p.retentionDays} Tagen.`,
    ],
    footer: ["Fermata · Diese Mail kam, weil diese Adresse auf der Warteliste eingetragen wurde."],
  });
  return {
    subject: "Bitte bestätigen Sie Ihre Anmeldung bei Fermata",
    html,
    text,
    template: "waitlist.confirm",
    purpose: "Double-Opt-in Warteliste",
  };
}

/** Willkommens-Mail nach der Bestätigung: Platz zum Zeitpunkt der Bestätigung, Einladung, Abmeldung. */
export function waitlistWelcomeMail(p: {
  firstName: string;
  place: number;
  regionGroup: string;
  isFoundingMember: boolean;
  foundingLimit: number;
  bonusPlaces: number;
  invited: boolean;
  statusUrl: string;
  inviteUrl?: string;
  unsubscribeUrl: string;
}): Draft {
  const region = regionLabel(p.regionGroup);
  const paragraphs = [
    `danke für Ihre Bestätigung. Zum Zeitpunkt der Bestätigung haben Sie Platz ${p.place} auf der Warteliste für ${region}.`,
  ];
  if (p.invited) {
    paragraphs.push(`Sie wurden persönlich eingeladen. Deshalb sind Sie und die Person, die Sie eingeladen hat, schon ${p.bonusPlaces} Plätze vorgerückt.`);
  }
  if (p.isFoundingMember) {
    paragraphs.push(`Sie gehören zu den ersten ${p.foundingLimit} aus ${region}. Damit sind Sie Gründungsmitglied von Fermata.`);
  }
  paragraphs.push(
    "Ihr Platz kann sich noch etwas verschieben, wenn andere Menschen jemanden einladen. Den aktuellen Stand sehen Sie auf Ihrer persönlichen Seite.",
  );
  const after: string[] = [];
  if (p.inviteUrl) {
    after.push(
      `Sie können eine Person persönlich einladen. Wenn sie sich einträgt und bestätigt, rücken Sie beide ${p.bonusPlaces} Plätze vor. Ihr Einladungslink: ${p.inviteUrl}`,
    );
  }
  after.push(
    "Wie es weitergeht: Wenn Fermata in Ihrer Region beginnt, bekommen Sie eine persönliche Einladung per E-Mail. Bis dahin schreiben wir Ihnen nur, wenn es Neues zum Start gibt.",
  );
  const { html, text } = renderMail({
    preheader: `Platz ${p.place} auf der Warteliste für ${region}.`,
    greeting: greeting(p.firstName),
    paragraphs,
    button: { label: "Meinen Platz ansehen", url: p.statusUrl },
    after,
    footer: [
      `Abmelden: ${p.unsubscribeUrl}`,
      "Bei einer Abmeldung löschen wir Ihren Eintrag vollständig.",
    ],
  });
  return {
    subject: "Willkommen bei Fermata: Ihr Platz auf der Warteliste",
    html,
    text,
    template: "waitlist.welcome",
    purpose: "Bestätigung Warteliste",
  };
}

/** Erneute Anmeldung mit einer schon bestätigten Adresse: neuer persönlicher Link. */
export function waitlistAlreadyMail(p: { firstName: string; statusUrl: string }): Draft {
  const { html, text } = renderMail({
    preheader: "Ihr persönlicher Link zu Platz und Einladung.",
    greeting: greeting(p.firstName),
    paragraphs: [
      "Ihre Adresse steht schon bestätigt auf der Warteliste von Fermata. Mit diesem Link sehen Sie Ihren Platz und Ihre Einladung.",
    ],
    button: { label: "Meinen Platz ansehen", url: p.statusUrl },
    after: [
      "Ältere Links zu Ihrer persönlichen Seite gelten ab jetzt nicht mehr.",
      "Wenn Sie das nicht angefordert haben, müssen Sie nichts tun.",
    ],
    footer: ["Fermata · Diese Mail kam, weil diese Adresse erneut auf der Warteliste eingetragen wurde."],
  });
  return {
    subject: "Ihr Link zur Warteliste von Fermata",
    html,
    text,
    template: "waitlist.already",
    purpose: "Statuslink Warteliste",
  };
}
