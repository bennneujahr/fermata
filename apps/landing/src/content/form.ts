// Texte und Regeln des Wartelisten-Formulars.
// Der Einwilligungstext steht wortgleich in ops.legal_documents (supabase/migrations/20261003000100_waitlist.sql);
// die Version wird mitgeschickt (Nachweis nach Art. 7 Abs. 1 DSGVO). ENTWURF bis zur Prüfung (Frage A9).
import { settings } from "../settings";

export const consent = {
  version: settings["waitlist.consent_version"],
  /** Vollständiger Text, genau wie in der Datenbank gespeichert. */
  text:
    "Ich möchte auf die Warteliste von Fermata. Dafür darf Fermata mir E-Mails schicken: die Bestätigung, meinen Platz und Nachrichten zum Start in meiner Region. Ich kann mich jederzeit abmelden; dann wird mein Eintrag gelöscht. Einzelheiten stehen in der Datenschutzerklärung.",
  /** Derselbe Text, aufgeteilt für den Link auf „Datenschutzerklärung“. */
  before:
    "Ich möchte auf die Warteliste von Fermata. Dafür darf Fermata mir E-Mails schicken: die Bestätigung, meinen Platz und Nachrichten zum Start in meiner Region. Ich kann mich jederzeit abmelden; dann wird mein Eintrag gelöscht. Einzelheiten stehen in der ",
  linkText: "Datenschutzerklärung",
  after: ".",
  href: "/datenschutz",
};

/** Regionsauswahl. Die Werte müssen zu app.waitlist_region_group() in der Datenbank passen. */
export const regionGroups = [
  {
    label: "Westmecklenburg (beginnt zuerst)",
    options: [
      { value: "schwerin", label: "Schwerin" },
      { value: "nordwestmecklenburg", label: "Wismar und Nordwestmecklenburg" },
      { value: "ludwigslust-parchim", label: "Ludwigslust-Parchim" },
    ],
  },
  {
    label: "Weitere Regionen",
    options: [
      { value: "hamburg", label: "Hamburg" },
      { value: "luebeck", label: "Lübeck" },
      { value: "rostock", label: "Rostock" },
      { value: "anderswo", label: "Anderswo" },
    ],
  },
];

export const form = {
  legend: "Ihre Angaben",
  requiredNote: "Alle Felder sind nötig.",
  fields: {
    first_name: { label: "Vorname", hint: "So sprechen wir Sie in E-Mails an." },
    email: { label: "E-Mail-Adresse", hint: "" },
    region: { label: "Region", placeholder: "Bitte wählen", hint: "" },
    postal_code: { label: "Postleitzahl", hint: "Damit wir später Lokale in Ihrer Nähe finden." },
  },
  honeypot: "Bitte dieses Feld leer lassen",
  submit: "Auf die Warteliste setzen",
  reassurance: "Kostenlos. Keine Cookies. Ihre Angaben liegen in Frankfurt, und Sie können sich jederzeit abmelden.",
  submitting: "Wird gesendet …",
  inviteNote: `Sie wurden persönlich eingeladen. Wenn Sie sich eintragen und bestätigen, rücken Sie und die Person, die Sie eingeladen hat, je ${settings["waitlist.bonus_places"]} Plätze vor.`,
  summaryOne: "Bitte prüfen Sie eine Angabe:",
  summaryMany: "Bitte prüfen Sie {n} Angaben:",
  errors: {
    first_name: {
      required: "Bitte geben Sie Ihren Vornamen an.",
      invalid: "Bitte nur Buchstaben, Leerzeichen, Punkt, Bindestrich oder Apostroph verwenden.",
    },
    email: {
      required: "Bitte geben Sie Ihre E-Mail-Adresse an.",
      invalid: "Diese E-Mail-Adresse sieht unvollständig aus. Beispiel: name@beispiel.de",
    },
    region: { required: "Bitte wählen Sie eine Region.", invalid: "Bitte wählen Sie eine Region aus der Liste." },
    postal_code: { required: "Bitte geben Sie Ihre Postleitzahl an.", invalid: "Die Postleitzahl hat fünf Ziffern." },
    consent: {
      required: "Bitte stimmen Sie den E-Mails zur Warteliste zu. Ohne diese Zustimmung können wir Sie nicht eintragen.",
      invalid: "Der Einwilligungstext hat sich inzwischen geändert. Bitte laden Sie die Seite neu.",
    },
  },
  general: {
    too_fast: "Das ging sehr schnell. Bitte prüfen Sie Ihre Angaben und senden Sie das Formular noch einmal.",
    throttled: "Von Ihrem Anschluss kamen gerade viele Anmeldungen. Bitte versuchen Sie es in einer Stunde noch einmal.",
    mail_failed: "Wir konnten gerade keine E-Mail verschicken. Bitte versuchen Sie es in ein paar Minuten noch einmal.",
    network: "Die Verbindung hat nicht geklappt. Bitte prüfen Sie Ihr Internet und versuchen Sie es noch einmal.",
    unknown: "Etwas hat nicht geklappt. Bitte versuchen Sie es in ein paar Minuten noch einmal.",
  },
};
