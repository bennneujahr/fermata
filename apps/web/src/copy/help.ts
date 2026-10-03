// Hilfe und Sicherheit (PLAN 1 Nr. 9, 5.2). Nummern und Zeiten kommen aus api.public_settings().
import { af, type AddressForm } from "./form";

export const help = (f: AddressForm) => ({
  title: "Hilfe und Sicherheit",
  lead: af(f, "Wenn etwas nicht stimmt, sind Sie nicht allein. Hier finden Sie schnell Hilfe.", "Wenn etwas nicht stimmt, bist du nicht allein. Hier findest du schnell Hilfe."),
  emergencyTitle: "Akute Gefahr",
  emergencyText: "Rufen Sie sofort die Polizei.",
  emergencyCta: (n: string) => `Notruf ${n} anrufen`,
  heimwegTitle: "Heimwegtelefon",
  heimwegText: "Jemand begleitet Sie am Telefon auf dem Heimweg, bis Sie sicher angekommen sind. Zum normalen Festnetztarif.",
  heimwegCta: (n: string) => `${n} anrufen`,
  heimwegHours: (h: string) => `Erreichbar ${h}`,
  reportTitle: "Etwas melden",
  reportText: af(f, "Melden Sie Übergriffe, Belästigung oder ein ungutes Gefühl – nach einem Abend oder jederzeit. Wir prüfen jede Meldung, in der Regel innerhalb von 24 Stunden. Die gemeldete Person erfährt nie, wer gemeldet hat.", "Melde Übergriffe, Belästigung oder ein ungutes Gefühl – nach einem Abend oder jederzeit. Wir prüfen jede Meldung, in der Regel innerhalb von 24 Stunden. Die gemeldete Person erfährt nie, wer gemeldet hat."),
  reportSoon: "Das Meldeformular folgt mit den ersten Abenden. Bis dahin schreiben Sie uns bitte per E-Mail.",
  shareTitle: "Abend teilen",
  shareText: "Mit einem Link sieht eine Vertrauensperson, wo und wann Ihr Abend ist. Der Link läuft 24 Stunden nach Beginn ab.",
  standardsTitle: "Unsere Standards",
  standards: [
    "Alle Mitglieder sind volljährig und haben ihren Ausweis gezeigt.",
    "Abende finden in Partner-Lokalen statt, an öffentlichen Orten.",
    "Ihr Gegenüber erfährt weder Ihren Nachnamen noch Ihre Adresse.",
    "Kontaktdaten werden nur geteilt, wenn Sie beide nach dem Abend „Ja“ sagen.",
  ],
  contactTitle: "Fragen zu Fermata",
  contactText: "Schreiben Sie uns. Wir antworten persönlich.",
  installLink: "Fermata als App installieren",
  comingSoon: "folgt",
});

export const install = {
  title: "Fermata als App",
  lead: "Auf dem Home-Bildschirm öffnet sich Fermata wie eine App – und auf dem iPhone kommen Erinnerungen nur so an.",
  iosTitle: "iPhone und iPad (Safari)",
  ios: [
    "Öffnen Sie Fermata in Safari.",
    "Tippen Sie unten auf „Teilen“ (das Quadrat mit dem Pfeil nach oben).",
    "Wählen Sie „Zum Home-Bildschirm“ und tippen Sie auf „Hinzufügen“.",
    "Öffnen Sie Fermata ab jetzt über das neue Symbol und melden Sie sich dort einmal mit Ihrem Code an.",
  ],
  iosNote: "Wichtig: Die installierte App hat eine eigene Anmeldung. Ein Link aus der Mail öffnet Safari – geben Sie in der App deshalb den sechsstelligen Code ein.",
  androidTitle: "Android (Chrome)",
  android: [
    "Öffnen Sie Fermata in Chrome.",
    "Tippen Sie oben rechts auf das Menü (drei Punkte).",
    "Wählen Sie „App installieren“ oder „Zum Startbildschirm hinzufügen“.",
  ],
  desktopTitle: "Computer",
  desktop: "In Chrome und Edge zeigt die Adresszeile ein Symbol zum Installieren. Nötig ist das nicht – Fermata funktioniert auch im Browser.",
  installed: "Fermata läuft gerade als installierte App.",
};

export const offline = {
  title: "Keine Verbindung",
  lead: "Fermata braucht gerade das Internet. Sobald die Verbindung zurück ist, geht es hier weiter.",
  emergency: "Im Notfall: 110",
  retry: "Neu laden",
};

export const legal = {
  title: "Rechtliches",
  lead: "Alle Texte sind Entwürfe, bis die rechtliche Prüfung abgeschlossen ist.",
  missing: "Dieser Text folgt.",
  back: "Zurück zu Rechtliches",
  version: (v: string) => `Fassung ${v}`,
  kinds: {
    impressum: "Impressum",
    datenschutz: "Datenschutzerklärung",
    agb: "Nutzungsbedingungen",
    datenschutz_kenntnis: "Datenschutzhinweise (kurz)",
    ki_hinweis: "Hinweis zu künstlicher Intelligenz",
    art9_profile: "Einwilligung: Geschlecht und gesuchtes Geschlecht",
    art9_religion: "Einwilligung: Religion",
    art9_health: "Einwilligung: Gesundheit",
    biometrie: "Einwilligung: Ausweisprüfung",
    gespraech: "Einwilligung: Gespräch mit Viola",
    push: "Einwilligung: Mitteilungen",
    kontakttausch: "Einwilligung: Kontakt teilen",
  } as Record<string, string>,
};
