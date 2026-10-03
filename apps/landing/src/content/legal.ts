// Impressum und Datenschutzerklärung als ENTWURF (PLAN 4: M1 legt die Gliederung an, M8 ergänzt, ein Anwalt prüft).
// [[…]] markiert Platzhalter; sie werden auf der Seite hervorgehoben. Nur was die Landingpage verarbeitet.
import { settings } from "../settings";

const contact = settings["site.contact_email"];

export interface LegalSection {
  title: string;
  paragraphs?: string[];
  list?: string[];
}
export interface LegalPage {
  title: string;
  heading: string;
  draftNote: string;
  version: string;
  sections: LegalSection[];
}

const draftNote =
  "ENTWURF: Dieser Text ist noch nicht rechtlich geprüft. Markierte Stellen sind Platzhalter und werden vor dem Start ergänzt.";

export const impressum: LegalPage = {
  title: "Impressum (Entwurf)",
  heading: "Impressum",
  draftNote,
  version: "Entwurf vom 3. Oktober 2026",
  sections: [
    {
      title: "Angaben gemäß § 5 DDG",
      paragraphs: ["[[Vor- und Nachname oder Firma]]", "[[Straße und Hausnummer]]", "[[Postleitzahl und Ort]]"],
    },
    {
      title: "Kontakt",
      list: [`E-Mail: [[${contact} (Frage A7)]]`, "Telefon: [[Telefonnummer (Frage A7)]]"],
    },
    {
      title: "Register und Umsatzsteuer",
      paragraphs: [
        "[[Falls vorhanden: Registergericht und Registernummer]]",
        "[[Umsatzsteuer-Identifikationsnummer nach § 27a UStG, falls vorhanden; hängt an Frage A5]]",
      ],
    },
    {
      title: "Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV",
      paragraphs: ["[[Name und Anschrift]]"],
    },
    {
      title: "Verbraucherstreitbeilegung",
      paragraphs: [
        "[[Teilnahme an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle: ja oder nein (§ 36 VSBG, Frage B14)]]",
      ],
    },
  ],
};

export const datenschutz: LegalPage = {
  title: "Datenschutzerklärung (Entwurf)",
  heading: "Datenschutzerklärung",
  draftNote,
  version: "Entwurf vom 3. Oktober 2026 · gilt nur für diese Landingpage und die Warteliste",
  sections: [
    {
      title: "1. Verantwortlich",
      paragraphs: [
        "[[Vor- und Nachname oder Firma, Anschrift]]",
        `E-Mail: [[${contact}]]`,
        "Datenschutzbeauftragte Person: [[Name und Kontakt (Frage B15)]]",
      ],
    },
    {
      title: "2. Kurz gesagt",
      list: [
        "Diese Seite setzt keine Cookies und speichert nichts auf Ihrem Gerät.",
        "Es gibt keine Analyse-Werkzeuge, keine Werbenetzwerke und keine eingebetteten Inhalte anderer Anbieter. Schriften und Bilder kommen von unserem eigenen Server.",
        "Daten erheben wir nur, wenn Sie sich auf die Warteliste setzen: Vorname, E-Mail-Adresse, Region und Postleitzahl.",
        "Die Daten liegen bei Supabase in Frankfurt am Main. E-Mails verschickt Brevo (Frankreich).",
      ],
    },
    {
      title: "3. Aufruf der Website (Hosting)",
      paragraphs: [
        "Die Seite wird von Vercel Inc. ausgeliefert (Sitz USA; die Server-Funktion für Plakat-Links läuft in Frankfurt, Region fra1). Beim Aufruf verarbeitet Vercel technisch notwendige Daten wie IP-Adresse, Zeitpunkt, aufgerufene Adresse und Browser-Kennung, um die Seite auszuliefern und vor Missbrauch zu schützen.",
        "Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO (sicherer Betrieb der Website). [[Speicherdauer der Protokolle bei Vercel, Auftragsverarbeitungsvertrag und Grundlage der Übermittlung in die USA (EU-US Data Privacy Framework oder Standardvertragsklauseln) prüfen]]",
      ],
    },
    {
      title: "4. Keine Cookies, keine Speicherung auf Ihrem Gerät",
      paragraphs: [
        "Diese Seite liest und speichert keine Informationen auf Ihrem Gerät (§ 25 TDDDG). Ihren persönlichen Link zur Warteliste trägt die Adresse selbst (hinter dem #-Zeichen); er wird nicht an unseren Webserver übertragen.",
      ],
    },
    {
      title: "5. Warteliste",
      paragraphs: [
        "Wenn Sie sich eintragen, verarbeiten wir: Vorname, E-Mail-Adresse, Region, Postleitzahl, Zeitpunkt und Version Ihrer Einwilligung, gegebenenfalls das Kürzel des Plakats, über das Sie gekommen sind, und gegebenenfalls den Einladungscode, mit dem Sie eingeladen wurden. Nach der Bestätigung kommen Ihr Platz, Ihr Gründungsstatus und Ihr Einladungscode hinzu.",
        "Zweck: Warteliste führen, Ihren Platz berechnen, Ihre Einladung ermöglichen und Sie zum Start in Ihrer Region per E-Mail informieren. Rechtsgrundlage ist Ihre Einwilligung (Art. 6 Abs. 1 lit. a DSGVO), die Sie jederzeit mit Wirkung für die Zukunft widerrufen können, zum Beispiel über den Abmeldelink.",
        "Double-Opt-in: Erst nach Klick auf den Link in der Bestätigungs-Mail steht eine Adresse auf der Liste. Unbestätigte Einträge löschen wir nach 7 Tagen. Bestätigte Einträge löschen wir, sobald Sie sich abmelden. Wenn Sie eingeladen werden und sich zum ersten Mal in der App anmelden, übernehmen wir nur Ihren Gründungsstatus in Ihr Konto und löschen den Eintrag auf der Warteliste.",
        "Die Angaben sind freiwillig. Ohne sie können wir Sie nicht auf die Warteliste setzen.",
      ],
    },
    {
      title: "6. Schutz vor Missbrauch",
      paragraphs: [
        "Um massenhafte Anmeldungen zu verhindern, zählen wir Anmeldeversuche je Anschluss. Dafür speichern wir Ihre IP-Adresse nicht im Klartext, sondern nur als Prüfwert (HMAC mit einem täglich wechselnden Schlüssel). Diese Einträge löschen wir nach 24 Stunden, den Schlüssel nach 2 Tagen. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO.",
      ],
    },
    {
      title: "7. Plakat-Links",
      paragraphs: [
        "Wenn Sie einen kurzen Link von einem Plakat aufrufen (zum Beispiel /s/kuerzel), zählen wir nur: welches Kürzel, an welchem Tag, wie oft. Wir speichern dabei keine IP-Adresse und setzen kein Cookie.",
      ],
    },
    {
      title: "8. Empfänger und Auftragsverarbeiter",
      list: [
        "Supabase (Datenbank und Funktionen), Rechenzentrum Frankfurt am Main. [[Vertragspartner, Auftragsverarbeitungsvertrag und Drittland-Bezug prüfen]]",
        "Brevo (Sendinblue SAS, Paris, Frankreich) für den Versand der E-Mails. Öffnungs- und Klickverfolgung sind ausgeschaltet. [[Auftragsverarbeitungsvertrag]]",
        "Vercel Inc. für die Auslieferung der Seite (siehe Abschnitt 3).",
      ],
    },
    {
      title: "9. Ihre Rechte",
      list: [
        "Auskunft (Art. 15 DSGVO), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung (Art. 18), Datenübertragbarkeit (Art. 20) und Widerspruch (Art. 21).",
        "Widerruf Ihrer Einwilligung jederzeit mit Wirkung für die Zukunft (Art. 7 Abs. 3 DSGVO), am einfachsten über den Abmeldelink.",
        "Beschwerde bei einer Aufsichtsbehörde (Art. 77 DSGVO), zum Beispiel beim Landesbeauftragten für Datenschutz und Informationsfreiheit Mecklenburg-Vorpommern. [[zuständige Behörde nach Sitz prüfen]]",
      ],
    },
  ],
};
