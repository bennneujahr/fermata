# Vorlage für eine Polizeimeldung – Gebrauchsanleitung

> **ENTWURF – nicht rechtsverbindlich, Prüfung durch Anwalt/Datenschutzbeauftragten ausstehend.**
> Stand: 03.10.2026. Code: `api.admin_police_report_template(report_id)` in
> `supabase/migrations/20261003000720_safety_admin.sql`; Beschreibung `docs/bereiche/sicherheit.md` Abschnitt 5.

## 1. Worum es geht

Bei einem schweren Vorfall (Null-Toleranz: Übergriff, Bedrohung, Verdacht auf Minderjährigkeit; aber auch Betrug)
kann Fermata Strafanzeige erstatten. Die Admin-Funktion erzeugt dafür **einen Textentwurf** aus den Daten, die
Fermata ohnehin hat. **Sie schickt nichts ab.** Ob und was an die Polizei geht, **entscheidest du (Benn)** – nach
Rücksprache mit der betroffenen Person.

## 2. Wann du die Vorlage nutzt – und wann nicht

| Lage | Was tun |
|---|---|
| **Akute Gefahr** (jemand ist gerade bedroht, verletzt, verfolgt) | Sofort **110** (bzw. die Person auffordern, 110 zu rufen). Keine Vorlage, keine Wartezeit. |
| Meldung über einen Übergriff oder eine Bedrohung, keine akute Gefahr | Meldung öffnen (`api.admin_report`), Person kontaktieren (sie hat „Rückmeldung gewünscht“ angegeben oder nicht), fragen, ob sie Anzeige will oder selbst erstattet. Erst dann Vorlage. |
| Die betroffene Person will **keine** Anzeige | In der Regel keine Anzeige durch Fermata; Ausnahme nur nach Rücksprache mit dem Anwalt (z. B. Gefahr für weitere Mitglieder). Sanktion (Sperre/Ausschluss) ist davon unabhängig. |
| Verdacht auf Minderjährigkeit ohne Straftat | keine Anzeige; Konto sperren, Prüfung |
| Betrug (Geldforderungen) | Anzeige möglich; betroffene Person zuerst fragen |

## 3. Ablauf Schritt für Schritt

1. **Meldung prüfen** im Admin-Bereich (Zwei-Faktor). Die Einsicht steht im Audit-Protokoll
   (`safety.admin_view_report`). Die gemeldete Person ist bei Null-Toleranz-Meldungen mit Beziehung bereits vorläufig
   gesperrt; offene Abende sind neutral abgesagt.
2. **Mit der betroffenen Person sprechen** (Telefon oder Mail aus ihrem Konto – nur wenn sie Kontakt wünscht):
   Möchte sie Anzeige erstatten? Selbst oder durch Fermata? Dürfen ihr Name und ihre Kontaktdaten in die Anzeige?
   Hilfsangebote nennen (Hilfetelefon Gewalt gegen Frauen 116 016, Weißer Ring, Polizei 110).
3. **Vorlage abrufen:** `api.admin_police_report_template(<report_id>)`. Jeder Abruf steht im Audit
   (`safety.police_template`).
4. **Vorlage bearbeiten** (außerhalb von Fermata, z. B. in einem Textdokument auf deinem verschlüsselten Rechner):
   alle `[ECKIGEN KLAMMERN]` ergänzen oder streichen; nur das hineinschreiben, was für die Anzeige nötig ist.
5. **Anzeige erstatten:** bei der zuständigen Polizeidienststelle oder über die Onlinewache
   Mecklenburg-Vorpommern [[Adresse prüfen]]. Kopie sicher ablegen [[Ablageort]].
6. **Weitergabe dokumentieren:** im Admin-Bereich als Entscheidung zur Meldung vermerken
   (`api.admin_decide_report` mit Begründung „Anzeige erstattet am … bei …“). [[Technik: eigener Audit-Eintrag
   „Weitergabe an Polizei“ wäre sauberer – heute nicht vorhanden]]
7. **Sanktion entscheiden** (Sperre, Ausschluss mit Sperrliste) – unabhängig von der Anzeige.
8. **Anfragen der Polizei** später (z. B. nach weiteren Daten) nur gegen schriftliche Anfrage mit Rechtsgrundlage
   beantworten; im Zweifel Anwalt fragen; jede Herausgabe im Audit vermerken.

## 4. Was die Vorlage enthält (aus dem Code)

```
ENTWURF – Sachverhaltsdarstellung für eine Strafanzeige

Wichtig: Diese Vorlage ist nur ein Entwurf. Ob Anzeige erstattet wird, entscheiden Sie (Benn) – nach Rücksprache
mit der betroffenen Person. Fermata erstattet nichts automatisch. Bei akuter Gefahr: 110.
Fehlende Angaben stehen in [ECKIGEN KLAMMERN] und müssen ergänzt oder gestrichen werden.

An: [ZUSTÄNDIGE POLIZEIDIENSTSTELLE ODER ONLINEWACHE MECKLENBURG-VORPOMMERN]
Von: Fermata, [ANSCHRIFT DES BETREIBERS], <site.contact_email>
Datum: [DATUM DER ANZEIGE]

1. Art des Vorfalls          – Kategorie der Meldung und Bereich (z. B. „Übergriff (… Bereich: abend)“)
2. Tatzeit                   – Beginn des verabredeten Treffens (Europe/Berlin)
3. Tatort                    – Lokal mit Anschrift
4. Beschuldigte Person       – Name, Geburtsdatum, Wohnort (PLZ, Ort) aus dem geprüften Konto
5. Geschädigte/meldende Person – [NUR MIT AUSDRÜCKLICHEM EINVERSTÄNDNIS EINTRAGEN]; „Kontakt gewünscht: ja/nein“
6. Schilderung               – Wortlaut der Meldung
7. Zeitpunkt der Meldung bei Fermata
8. Bisherige Maßnahmen       – aktive Sanktionen (z. B. „Vorläufige Sperre des Kontos seit …“)
9. Beweismittel              – [Z. B. Nachrichten, Fotos, Zeuginnen und Zeugen, Personal des Lokals]
Interne Kennung der Meldung
Hinweis Datenschutz: Daten der beschuldigten Person nur an die Polizei weitergeben, wenn Sie Anzeige erstatten
(Art. 6 Abs. 1 lit. f DSGVO, § 24 BDSG). Weitergabe im Audit-Protokoll vermerken.
```

**Nicht enthalten** (bewusst): Art.-9-Angaben, Gesprächstexte mit Viola, Rückmeldungen, Scores, Daten der meldenden
Person (nur Platzhalter).

## 5. Datenschutz und Recht (für den Anwalt)

- **Grundlage der Weitergabe:** Art. 6 Abs. 1 lit. f DSGVO (Schutz der Betroffenen, Durchsetzung von Ansprüchen) und
  § 24 Abs. 1 Nr. 1 BDSG (Zweckänderung zur Verfolgung von Straftaten). [[prüfen]]
- **Art. 10 DSGVO:** Die Meldung selbst enthält Angaben über (mutmaßliche) Straftaten. Ob Fermata diese Daten auf
  Art. 6 Abs. 1 lit. f stützen kann, ist zu prüfen. [[Anwalt]]
- **Art. 9:** Schilderungen sexueller Übergriffe betreffen das Sexualleben (Art. 9 Abs. 1); Grundlage für die
  Weitergabe ggf. Art. 9 Abs. 2 lit. f (Rechtsansprüche). [[Anwalt]]
- **Datensparsamkeit:** nur nötige Angaben; die meldende Person nur mit ausdrücklichem Einverständnis.
- **Information der beschuldigten Person** (Art. 14): Ausnahme nach Art. 14 Abs. 5 lit. b bzw. § 33 BDSG, solange die
  Strafverfolgung gefährdet wäre. [[Anwalt]]
- **Transkripte:** werden nach 30 Tagen gelöscht (B5). Ist ein Gespräch mit Viola beweiserheblich, muss die
  Verlängerung vor Ablauf entschieden werden; heute gibt es dafür nur die allgemeine Einstellung
  `interview.safety_transcript_retention_days` und keine Admin-Einsicht.

## Offene Punkte für Benn/Anwalt

1. Rechtsgrundlagen (Art. 6 Abs. 1 lit. f, § 24 BDSG, Art. 9 Abs. 2 lit. f, Art. 10) bestätigen.
2. Eigenen Audit-Eintrag „Weitergabe an Polizei“ (Empfänger, Datum, Umfang) bauen lassen.
3. Ablageort für Kopien von Anzeigen festlegen (verschlüsselt, Frist).
4. Zuständige Dienststelle bzw. Onlinewache MV und Opferhilfe-Kontakte eintragen.
5. B5: Transkripte bei Sicherheitsfällen länger aufbewahren – Entscheidung.
