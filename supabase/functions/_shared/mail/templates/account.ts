// Mails rund ums Konto (M2): Einladung und Bestätigung der Löschung. Ruhiger Ton, Anrede „Sie“
// (vor der ersten Anmeldung kennen wir keine andere Anrede; nach der Löschung gilt die gewählte).
import { renderMail } from "../layout.ts";
import type { MailMessage } from "../types.ts";

const dateFmt = new Intl.DateTimeFormat("de-DE", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Europe/Berlin",
});

export function inviteMail(input: { to: string; appUrl: string; expiresAt: Date; contactEmail?: string }): MailMessage {
  const login = `${input.appUrl.replace(/\/$/, "")}/anmelden`;
  const until = dateFmt.format(input.expiresAt);
  const { html, text } = renderMail({
    preheader: "Ihre persönliche Einladung zu Fermata",
    greeting: "Guten Tag,",
    paragraphs: [
      "Ihr Platz ist an der Reihe: Sie sind persönlich zu Fermata eingeladen.",
      "Melden Sie sich mit dieser E-Mail-Adresse an. Sie bekommen dann einen sechsstelligen Code, mit dem Sie Ihr Konto einrichten. Ein Passwort brauchen Sie nicht.",
    ],
    button: { label: "Zu Fermata", url: login },
    after: [
      `Die Einladung gilt bis zum ${until}. Danach löschen wir das vorbereitete Konto wieder.`,
      "Bis einschließlich zu Ihrem ersten Abend ist Fermata kostenlos und ohne Karte.",
    ],
    footer: [
      "Sie bekommen diese Mail, weil Sie auf der Warteliste von Fermata stehen oder persönlich eingeladen wurden.",
      ...(input.contactEmail ? [`Fragen: ${input.contactEmail}`] : []),
    ],
  });
  return {
    to: input.to,
    subject: "Ihre Einladung zu Fermata",
    html,
    text,
    template: "account.invite",
    purpose: "einladung",
  };
}

export function accountDeletedMail(
  input: { to: string; firstName?: string | null; addressForm?: "sie" | "du"; contactEmail?: string },
): MailMessage {
  const du = input.addressForm === "du";
  const greeting = input.firstName
    ? (du ? `Hallo ${input.firstName},` : `Guten Tag ${input.firstName},`)
    : du
    ? "Hallo,"
    : "Guten Tag,";
  const { html, text } = renderMail({
    preheader: du ? "Dein Konto ist gelöscht" : "Ihr Konto ist gelöscht",
    greeting,
    paragraphs: [
      du
        ? "wie gewünscht haben wir dein Konto bei Fermata gelöscht. Deine Angaben, Einwilligungen, Gesprächstexte und dein Profil sind entfernt."
        : "wie gewünscht haben wir Ihr Konto bei Fermata gelöscht. Ihre Angaben, Einwilligungen, Gesprächstexte und Ihr Profil sind entfernt.",
      du
        ? "Was das Gesetz uns aufzubewahren vorschreibt (zum Beispiel Rechnungen und Vertragserklärungen), bewahren wir ohne Bezug zu deinem Konto bis zum Ende der Frist auf."
        : "Was das Gesetz uns aufzubewahren vorschreibt (zum Beispiel Rechnungen und Vertragserklärungen), bewahren wir ohne Bezug zu Ihrem Konto bis zum Ende der Frist auf.",
      du ? "Danke, dass du Fermata ausprobiert hast." : "Danke, dass Sie Fermata ausprobiert haben.",
    ],
    footer: [
      "Diese Mail ist die Bestätigung Ihrer Löschung. Sie müssen nichts weiter tun.",
      ...(input.contactEmail ? [`Fragen: ${input.contactEmail}`] : []),
    ],
  });
  return {
    to: input.to,
    subject: du ? "Dein Konto ist gelöscht" : "Ihr Konto ist gelöscht",
    html,
    text,
    template: "account.deleted",
    purpose: "loeschung",
  };
}
