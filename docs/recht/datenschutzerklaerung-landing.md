# Datenschutzerklärung für die Landingpage und die Warteliste

> **ENTWURF – nicht rechtsverbindlich, Prüfung durch Anwalt/Datenschutzbeauftragten ausstehend.**
> Stand: 03.10.2026 · Fassung `datenschutz-landing-2026-10-03-entwurf`.
> Grundlage: der Seitenentwurf in `apps/landing/src/content/legal.ts` (M1) und der Code der Warteliste
> (`supabase/migrations/20261003000100_waitlist.sql`, Edge Functions `waitlist-*`, `link-hit`).
> Platzhalter stehen in `[[doppelten eckigen Klammern]]`. Diese Erklärung beschreibt **nur**, was die Landingpage
> verarbeitet. Für Mitglieder gilt [datenschutzerklaerung-app.md](datenschutzerklaerung-app.md).

**Abgleich mit dem Seitenentwurf (M1):** Der Text unten übernimmt die Gliederung aus `legal.ts` und ergänzt drei
Punkte, die auf der Seite noch fehlen: was mit dem Eintrag passiert, wenn aus der Warteliste ein Konto wird
(Abschnitt 5), den Hinweis auf die Statusseite (Abschnitt 5) und den Datenschutzbeauftragten. Nach der Freigabe
durch den Anwalt muss `legal.ts` an diesen Text angepasst werden (die Seite liest ihn nicht aus dieser Datei).

---

## 1. Verantwortlich

[[Vor- und Nachname oder Firma, Anschrift]]
E-Mail: [[hallo@… (Frage A7)]]
Datenschutzbeauftragte Person: [[Name und Kontakt (Frage B15)]]

## 2. Kurz gesagt

- Diese Seite setzt keine Cookies und speichert nichts auf Ihrem Gerät.
- Es gibt keine Analyse-Werkzeuge, keine Werbenetzwerke und keine eingebetteten Inhalte anderer Anbieter. Schriften
  und Bilder kommen von unserem eigenen Server.
- Daten erheben wir nur, wenn Sie sich auf die Warteliste setzen: Vorname, E-Mail-Adresse, Region und Postleitzahl.
- Die Daten liegen bei Supabase in Frankfurt am Main. E-Mails verschickt Brevo (Frankreich).

## 3. Aufruf der Website (Hosting)

Die Seite wird von Vercel Inc. ausgeliefert (Sitz USA). Die einzige Server-Funktion (Plakat-Links, Abschnitt 7) läuft
in Frankfurt (Region `fra1`); die übrigen Seiten sind fertige Dateien und werden über das Netz von Vercel
ausgeliefert. Beim Aufruf verarbeitet Vercel technisch notwendige Daten wie IP-Adresse, Zeitpunkt, aufgerufene
Adresse und Browser-Kennung, um die Seite auszuliefern und vor Missbrauch zu schützen.

Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO (sicherer Betrieb der Website). Speicherdauer der Protokolle bei
Vercel: [[laut Vercel-Vertrag eintragen]]. Grundlage der Übermittlung in die USA: [[EU-US Data Privacy Framework
oder Standardvertragsklauseln – prüfen]].

## 4. Keine Cookies, keine Speicherung auf Ihrem Gerät

Diese Seite liest und speichert keine Informationen auf Ihrem Gerät (§ 25 TDDDG). Ihren persönlichen Link zur
Warteliste trägt die Adresse selbst (hinter dem #-Zeichen); dieser Teil wird nicht an unseren Webserver übertragen.

## 5. Warteliste

**Was wir verarbeiten:** Vorname, E-Mail-Adresse, Region, Postleitzahl, Zeitpunkt und Fassung Ihrer Einwilligung,
gegebenenfalls das Kürzel des Plakats, über das Sie gekommen sind, und gegebenenfalls den Einladungscode, mit dem Sie
eingeladen wurden. Nach der Bestätigung kommen Ihr Platz (eine Grundnummer je Region und die Zahl Ihrer
Vorrückungen), Ihr Gründungsstatus und Ihr eigener Einladungscode hinzu. Für die Links in den E-Mails speichern wir
nur nicht umkehrbare Prüfwerte (SHA-256), nicht die Links selbst.

**Zweck:** Warteliste führen, Ihren Platz berechnen, Ihre Einladung ermöglichen und Sie zum Start in Ihrer Region per
E-Mail informieren. Die erste Mail ist eine Bestätigungsbitte ohne Werbung.

**Rechtsgrundlage:** Ihre Einwilligung (Art. 6 Abs. 1 lit. a DSGVO). Den Einwilligungstext finden Sie im Formular;
wir speichern, welcher Fassung Sie zugestimmt haben. Sie können die Einwilligung jederzeit mit Wirkung für die
Zukunft widerrufen, am einfachsten über den Abmeldelink in jeder E-Mail oder auf Ihrer persönlichen Seite.

**Double-Opt-in:** Erst nach Klick auf den Link in der Bestätigungs-Mail (gültig 72 Stunden) stehen Sie auf der
Liste. Unbestätigte Einträge löschen wir 7 Tage nach der letzten Mail automatisch.

**Abmeldung:** Nach Ihrer Bestätigung auf der Seite „Abmelden“ löschen wir Ihren Eintrag sofort. Ihr Einladungscode
verfällt mit. Hat Sie jemand eingeladen, bleibt bei der einladenden Person nur vermerkt, dass ihr Code genutzt wurde.

**Wenn aus der Warteliste ein Konto wird:** Laden wir Sie in die Web-App ein, vermerken wir das am Eintrag und
übernehmen Ihren Gründungsstatus ins Konto. Der Wartelisten-Eintrag bleibt bestehen, bis Sie sich abmelden oder Ihr
Konto löschen; mit der Kontolöschung löschen wir ihn ebenfalls. [[Benn: Eintrag stattdessen bei Kontoeröffnung
löschen? Dann diesen Satz ändern.]]

**Persönliche Seite:** Über Ihren persönlichen Link sehen Sie Platz, Gründungsstatus und Einladungslink. Fordern Sie
einen neuen Link an, verliert der alte seine Gültigkeit.

**Die Angaben sind freiwillig.** Ohne sie können wir Sie nicht auf die Warteliste setzen.

**Gleiche Antwort für alle:** Das Formular antwortet bei neuen, unbestätigten und schon bestätigten Adressen gleich.
So kann niemand herausfinden, ob eine bestimmte Person auf der Liste steht.

## 6. Schutz vor Missbrauch

Um massenhafte Anmeldungen zu verhindern, zählen wir Anmeldeversuche je Anschluss (höchstens 5 je Stunde). Dafür
speichern wir Ihre IP-Adresse nicht im Klartext, sondern nur als Prüfwert (HMAC mit einem täglich wechselnden
Schlüssel). Diese Einträge löschen wir nach 24 Stunden, den Tagesschlüssel nach 2 Tagen; danach lässt sich ein
Prüfwert keiner Adresse mehr zuordnen. Zusätzlich gibt es ein für Menschen unsichtbares Feld und eine Mindestzeit
für das Ausfüllen. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO.

## 7. Plakat-Links

Wenn Sie einen kurzen Link von einem Plakat aufrufen (zum Beispiel `/s/kuerzel`), zählen wir nur: welches Kürzel,
an welchem Tag, wie oft. Wir speichern dabei keine IP-Adresse und setzen kein Cookie. Das Kürzel geht danach als
Quelle mit Ihrer Anmeldung mit, wenn Sie sich eintragen.

## 8. Empfänger und Auftragsverarbeiter

- Supabase (Datenbank und Funktionen), Rechenzentrum Frankfurt am Main. [[Vertragspartner, Auftragsverarbeitungs-
  vertrag und Drittland-Bezug (US-Mutterunternehmen) prüfen]]
- Brevo (Sendinblue SAS, Paris, Frankreich) für den Versand der E-Mails. Öffnungs- und Klickverfolgung sind
  ausgeschaltet. [[Auftragsverarbeitungsvertrag]]
- Vercel Inc. für die Auslieferung der Seite (siehe Abschnitt 3).

## 9. Speicherdauer

| Daten | Dauer |
|---|---|
| Unbestätigter Eintrag | 7 Tage nach der letzten Mail |
| Bestätigter Eintrag | bis zur Abmeldung oder zur Löschung eines späteren Kontos |
| Prüfwert der IP-Adresse | 24 Stunden (Schlüssel 2 Tage) |
| Plakat-Zähler | dauerhaft, ohne Personenbezug |

## 10. Ihre Rechte

- Auskunft (Art. 15 DSGVO), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung (Art. 18),
  Datenübertragbarkeit (Art. 20) und Widerspruch (Art. 21).
- Widerruf Ihrer Einwilligung jederzeit mit Wirkung für die Zukunft (Art. 7 Abs. 3 DSGVO), am einfachsten über den
  Abmeldelink.
- Beschwerde bei einer Aufsichtsbehörde (Art. 77 DSGVO), zum Beispiel beim Landesbeauftragten für Datenschutz und
  Informationsfreiheit Mecklenburg-Vorpommern. [[zuständige Behörde nach Sitz prüfen]]

*Entwurf vom 03.10.2026.*

---

## Offene Punkte für Benn/Anwalt

1. **Pflicht-Häkchen** (Frage A9): Einwilligung zu Start-Mails als Bedingung für die Warteliste – Kopplungsverbot
   (Art. 7 Abs. 4 DSGVO) prüfen (PLAN 5.13). Alternative: Rechtsgrundlage Art. 6 Abs. 1 lit. b (vorvertraglich), dann
   Text ändern.
2. Verantwortlicher, Kontakt, Datenschutzbeauftragter (A7, B15).
3. Vercel: Protokolldauer, AV-Vertrag, Drittland-Grundlage.
4. Wartelisten-Eintrag nach Kontoeröffnung: behalten oder löschen (Abschnitt 5).
5. Nach Freigabe `apps/landing/src/content/legal.ts` angleichen (der Text ist dort fest eingebaut; ein Test prüft nur
   den Einwilligungstext, nicht die Datenschutzerklärung).
6. Der Einwilligungstext der Warteliste steht wortgleich in `ops.legal_documents` (Fassung
   `warteliste-2026-10-03-entwurf`) und in `apps/landing/src/content/form.ts`; eine neue Fassung braucht eine neue
   Versionsnummer in beiden und in der Einstellung `waitlist.consent_version`.
