// Allgemeine Texte: Marke, Navigation, Knöpfe, Fehler. Alle sichtbaren Texte stehen in src/copy (Tonalitätsprüfung).
import { af, type AddressForm } from "./form";

export const brand = {
  name: "Fermata",
  claim: "Echte Abende statt Wischen.",
  description: "Fermata verabredet Abende zwischen zwei Menschen in Partner-Lokalen – ohne Wischen, ohne Feed, ohne Chat.",
};

export const nav = {
  label: "Hauptnavigation",
  start: "Start",
  gespraech: "Gespräch",
  abende: "Abende",
  mitgliedschaft: "Mitgliedschaft",
  konto: "Konto",
  hilfe: "Hilfe",
  hilfeLang: "Hilfe und Sicherheit",
  skip: "Zum Inhalt springen",
  logout: "Abmelden",
  home: "Fermata, zur Startseite",
  legal: "Rechtliches",
  admin: "Admin",
  backToAccount: "Zurück zum Konto",
};

export const actions = {
  continue: "Weiter",
  back: "Zurück",
  save: "Speichern",
  saving: "Wird gespeichert …",
  cancel: "Abbrechen",
  close: "Schließen",
  later: "Später weitermachen",
  retry: "Noch einmal versuchen",
  edit: "Ändern",
  toStart: "Zur Startseite",
};

export const status = {
  draft: "Entwurf",
  draftLong: "Entwurf – der verbindliche Text folgt nach rechtlicher Prüfung.",
  comingSoon: "folgt",
  loading: "Wird geladen …",
};

export const errors = {
  generic: (f?: AddressForm) =>
    af(f, "Das hat nicht geklappt. Bitte versuchen Sie es gleich noch einmal.", "Das hat nicht geklappt. Bitte versuch es gleich noch einmal."),
  network: "Keine Verbindung. Bitte prüfen Sie Ihre Internetverbindung.",
  notFoundTitle: "Diese Seite gibt es nicht",
  notFoundText: "Vielleicht hat sich die Adresse geändert. Von der Startseite aus finden Sie alles wieder.",
  errorTitle: "Etwas ist schiefgegangen",
  errorText: "Wir haben den Fehler bemerkt. Bitte laden Sie die Seite neu oder versuchen Sie es später noch einmal.",
  noAccountTitle: "Kein Mitgliedskonto",
  noAccountText: "Mit dieser Anmeldung gibt es kein Mitgliedskonto. Fermata ist nur mit persönlicher Einladung möglich.",
  suspendedTitle: "Ihr Konto ist vorläufig gesperrt",
  suspendedText: "Wir prüfen gerade etwas und melden uns per E-Mail. Bei Fragen schreiben Sie uns.",
};

export const footer = {
  legal: "Rechtliches",
  privacy: "Datenschutz",
  imprint: "Impressum",
  terms: "Nutzungsbedingungen",
  ai: "Hinweis zu KI",
  install: "App installieren",
  note: "Ohne Werbung, ohne Analyse-Werkzeuge, nur ein Cookie für die Anmeldung.",
};

export const theme = {
  legend: "Darstellung",
  system: "Wie das Gerät",
  light: "Hell",
  dark: "Dunkel",
  hint: "Die Wahl wird nur auf diesem Gerät gespeichert.",
};
