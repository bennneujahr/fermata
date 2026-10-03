# Rechtstexte und Datenschutz-Unterlagen (M8)

> **ENTWURF – nicht rechtsverbindlich, Prüfung durch Anwalt/Datenschutzbeauftragten ausstehend.**
> Stand: 03.10.2026. Alle Unterlagen sind aus dem Code abgeleitet; die Datenkarte steht in
> [`docs/DATA.md`](../DATA.md).

| Datei | Für wen | Inhalt |
|---|---|---|
| [datenschutzerklaerung-app.md](datenschutzerklaerung-app.md) | Mitglieder | Datenschutzerklärung Web-App und Gespräch mit Viola (Art. 9, KI, Art. 22) |
| [datenschutzerklaerung-landing.md](datenschutzerklaerung-landing.md) | Besucher | nur Landingpage und Warteliste |
| [impressum.md](impressum.md) | alle | Impressum mit Platzhaltern |
| [agb.md](agb.md) | Mitglieder | Nutzungsbedingungen: 18+, Ausweis, Verhalten, Sanktionen, Stufen, Kündigung, Widerruf |
| [widerrufsbelehrung.md](widerrufsbelehrung.md) | Mitglieder | Widerrufsbelehrung und Muster-Formular |
| [einwilligungen.md](einwilligungen.md) | Mitglieder | alle Einwilligungstexte mit Abgleich gegen die Datenbank |
| [ki-hinweis.md](ki-hinweis.md) | Mitglieder | KI-Hinweis (gesprochen, angezeigt, schriftlich) |
| [dsfa.md](dsfa.md) | intern, Aufsicht | Datenschutz-Folgenabschätzung |
| [vvt.md](vvt.md) | intern, Aufsicht | Verzeichnis von Verarbeitungstätigkeiten |
| [av-liste.md](av-liste.md) | intern | Auftragsverarbeiter und Empfänger |
| [tom.md](tom.md) | intern, Auftragsverarbeitung | technische und organisatorische Maßnahmen |
| [loeschkonzept.md](loeschkonzept.md) | intern | Fristen, Jobs, Lücken, Sperrliste |
| [polizeimeldung-vorlage.md](polizeimeldung-vorlage.md) | Benn | Gebrauchsanleitung für die Polizeivorlage |

**Reihenfolge für den Anwalt:** zuerst DSFA und Einwilligungen (sie bestimmen, was die App darf), dann
Datenschutzerklärungen, AGB und Widerrufsbelehrung, zuletzt Impressum. Die wichtigsten Code-Lücken mit rechtlicher
Wirkung stehen in der DSFA (Abschnitt 6) und am Ende der AGB.

## Offene Punkte für Benn/Anwalt

1. Externen Datenschutzbeauftragten benennen (B15) und ihm diese Unterlagen geben.
2. Nach der Prüfung: Texte für Mitglieder als neue Fassungen in `ops.legal_documents` anlegen; Landingpage-Texte in
   `apps/landing/src/content/legal.ts` übernehmen.
