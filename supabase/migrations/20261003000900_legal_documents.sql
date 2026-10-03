-- Fermata · Härtung: Rechtstexte in ops.legal_documents
-- 1. Ein Namensschema für die Arten (Einwilligungen heißen wie in app.consents; Dokumente impressum, datenschutz,
--    agb, widerruf, ki_hinweis; dazu die Wartelisten-Einwilligung einwilligung_warteliste). Die ungenutzten Arten aus
--    M0 (einwilligung_art9, einwilligung_biometrie, einwilligung_gespraech, einwilligung_push) entfallen.
-- 2. Impressum, Datenschutzerklärung, Nutzungsbedingungen, Widerrufsbelehrung (mit Muster-Formular) und KI-Hinweis
--    als ENTWURF, Fassung 2026-10-03-entwurf.
-- 3. Neue Fassungen der Einwilligungstexte (2026-10-03-m8-entwurf): wahrheitsgemäßer Text zum Gespräch mit Viola
--    (Anbieter, KI-Auswertung, Sicherheitsprüfung, Art.-9-Klausel), Geschlecht/Gegenüber, Kontakttausch (Widerruf),
--    Religion, Ausweisprüfung, Mitteilungen, Datenschutzhinweise.
-- 4. art9_health wird in Phase 1 nicht angeboten (Text auf abgeloest; Entscheidung datensparsam, PLATZHALTER C10).
--
-- Quelle der Texte: docs/recht/*.md, jeweils zwischen <!-- db kind=… version=… title=… --> und <!-- /db -->,
-- umgewandelt mit supabase/functions/_shared/legal/markdown.ts (toAppMarkdown). Der Deno-Test
-- supabase/functions/_shared/legal/legal_docs.test.ts prüft, dass Datenbank und Dateien übereinstimmen.
--
-- Grundsatz: Eine Fassung wird nie geändert. Alte Fassungen bleiben als Nachweis (Status abgeloest). Je Art ist
-- danach genau eine Fassung aktuell (api.legal_document liefert sie).

-- ---------------------------------------------------------------------------
-- 1. Erlaubte Arten
-- ---------------------------------------------------------------------------
do $$
declare
  v_kinds text[];
begin
  select array_agg(distinct k order by k) into v_kinds
  from (
    select unnest(array[
      'impressum', 'datenschutz', 'agb', 'widerruf', 'ki_hinweis', 'einwilligung_warteliste',
      'datenschutz_kenntnis', 'art9_profile', 'art9_religion', 'art9_health',
      'biometrie', 'gespraech', 'push', 'kontakttausch']) as k
    -- Vorhandene Zeilen behalten immer ihre Art (falls eine Umgebung schon andere Texte hat).
    union select d.kind from ops.legal_documents d
  ) s;
  alter table ops.legal_documents drop constraint if exists legal_documents_kind_check;
  execute format('alter table ops.legal_documents add constraint legal_documents_kind_check check (kind = any (%L::text[]))', v_kinds);
end
$$;
comment on column ops.legal_documents.kind is
  'Art: Einwilligungen wie app.consents.kind; Dokumente impressum, datenschutz, agb, widerruf, ki_hinweis; einwilligung_warteliste (Landingpage).';

-- ---------------------------------------------------------------------------
-- 2./3. Neue Texte (aus docs/recht, siehe oben)
-- ---------------------------------------------------------------------------
create temp table new_legal_documents (kind text, version text, status text, title text, body_markdown text) on commit drop;

insert into new_legal_documents (kind, version, status, title, body_markdown) values
-- Quelle: docs/recht/impressum.md
('impressum', '2026-10-03-entwurf', 'entwurf', 'Impressum',
$md$## Angaben gemäß § 5 DDG

[[Vor- und Nachname, bei einer Gesellschaft: Firma und Rechtsform]]
[[Straße und Hausnummer (ladungsfähige Anschrift, kein Postfach)]]
[[Postleitzahl und Ort]]

[[Bei einer Gesellschaft: vertretungsberechtigte Person(en)]]

## Kontakt

E-Mail: [[hallo@… (Frage A7; Einstellung site.contact_email)]]
Telefon: [[Telefonnummer (Frage A7)]]

## Register

[[Falls eingetragen: Registergericht und Registernummer – sonst Abschnitt streichen]]

## Umsatzsteuer

[[Umsatzsteuer-Identifikationsnummer nach § 27a UStG, falls vorhanden. Hängt an Frage A5 (Ausweis der USt oder
Kleinunternehmer nach § 19 UStG).]]

## Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV

[[Name und Anschrift]]

## Datenschutzbeauftragte Person

[[Name und Kontakt des externen Datenschutzbeauftragten (Frage B15)]]

## Verbraucherstreitbeilegung

[[Frage B14 – eine der beiden Fassungen wählen:]]

*Fassung A (keine Teilnahme):* Wir sind nicht bereit und nicht verpflichtet, an Streitbeilegungsverfahren vor einer
Verbraucherschlichtungsstelle teilzunehmen.

*Fassung B (Teilnahme):* Wir nehmen an Streitbeilegungsverfahren vor folgender Verbraucherschlichtungsstelle teil:
[[Name, Anschrift und Website der Stelle, z. B. Universalschlichtungsstelle des Bundes]].

*Entwurf vom 03.10.2026. Der verbindliche Text folgt nach rechtlicher Prüfung.*$md$),

-- Quelle: docs/recht/datenschutzerklaerung-app.md
('datenschutz', '2026-10-03-entwurf', 'entwurf', 'Datenschutzerklärung',
$md$## 1. Wer verantwortlich ist

[[Vor- und Nachname oder Firma]]
[[Straße und Hausnummer]], [[PLZ und Ort]]
E-Mail: [[datenschutz@… (Frage A7)]] · Telefon: [[… (Frage A7)]]

**Datenschutzbeauftragte Person:** [[Name, Anschrift, E-Mail des externen Datenschutzbeauftragten (Frage B15)]]

## 2. Das Wichtigste in Kürze

- Fermata verabredet Abende zwischen zwei Menschen in Partner-Lokalen. Dafür brauchen wir Angaben über Sie, auch besonders geschützte (zum Beispiel, wen Sie kennenlernen möchten).
- Alle Daten liegen in einer Datenbank in **Frankfurt am Main**. Wir verkaufen keine Daten, zeigen keine Werbung und nutzen keine Analyse- oder Werbe-Cookies.
- **Viola ist eine künstliche Intelligenz**, kein Mensch. Ihre Stimme wird nicht aufgezeichnet. Der Text des Gesprächs wird nach **30 Tagen** gelöscht. Was Sie im Gespräch sagen, verarbeiten Spracherkennung und Sprachmodell live (Abschnitt 9).
- Vorschläge für einen Abend berechnet ein Programm mit Hilfe eines Sprachmodells. **Jeden Vorschlag prüft und gibt ein Mensch frei.** Besonders geschützte Angaben (Geschlecht, Orientierung, Religion, Gesundheit) sieht das Sprachmodell der Auswahl nie.
- Ihr Gegenüber erfährt nur Ihren Vornamen, den kurzen Text „Warum Sie beide“, am Abend Ihr freiwilliges Erkennungszeichen und – nur wenn Sie beide „Ja“ sagen – die Kontaktdaten, die Sie freigeben.
- Sie können Ihre Daten jederzeit herunterladen, Einwilligungen einzeln widerrufen und Ihr Konto löschen (in der App unter „Konto“).

## 3. Aufruf der Web-App, Cookies und Speicher im Browser

**Auslieferung:** Die Web-App wird von Vercel Inc. ausgeliefert; die Server-Funktionen laufen in Frankfurt
(Region fra1). Beim Aufruf verarbeitet Vercel technisch
notwendige Daten (IP-Adresse, Zeitpunkt, Adresse der Seite, Browser-Kennung), um die Seite auszuliefern und vor
Missbrauch zu schützen. Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO. Speicherdauer der Protokolle bei Vercel:
[[laut Vercel-Vertrag eintragen]].

**Speicher in Ihrem Browser (§ 25 TDDDG):**

- Anmelde-Cookie von Supabase (Sitzung) – Wozu: hält Sie angemeldet · Grundlage: unbedingt erforderlich (§ 25 Abs. 2 Nr. 2 TDDDG), Art. 6 Abs. 1 lit. b DSGVO · Dauer: bis zur Abmeldung bzw. Ablauf der Sitzung
- Farbschema (hell/dunkel) im Local Storage – Wozu: merkt sich Ihre Wahl auf diesem Gerät · Grundlage: auf Ihren Wunsch, § 25 Abs. 2 Nr. 2 TDDDG [[Anwalt prüfen]] · Dauer: bis Sie es ändern oder den Browser-Speicher löschen
- Service Worker und Zwischenspeicher – Wozu: App funktioniert auch bei schlechter Verbindung, Empfang von Mitteilungen · Grundlage: unbedingt erforderlich bzw. Einwilligung „Mitteilungen“ · Dauer: bis zur Deinstallation
- Push-Abo – Wozu: Mitteilungen auf diesem Gerät · Grundlage: Ihre Einwilligung (§ 25 Abs. 1 TDDDG, Art. 6 Abs. 1 lit. a DSGVO) · Dauer: bis Sie es abschalten

Die Web-App lädt keine Schriften, Skripte oder Bilder von fremden Servern. Ausnahmen, die Sie selbst auslösen: die
Bezahlseite von Stripe (Abschnitt 13), die Ausweisprüfung bei Didit (Abschnitt 8) und die Sprachverbindung zu Viola
(Abschnitt 9).

## 4. Einladung, Konto und Anmeldung

Sie erhalten eine persönliche Einladung. Dafür legen wir mit Ihrer E-Mail-Adresse ein Konto an. Wenn Sie über die
Warteliste kamen, übernehmen wir Ihren Gründungsstatus und vermerken die Einladung auf der Warteliste.

- **Daten:** E-Mail-Adresse, Zeitpunkte von Einladung und Anmeldungen, Anrede (Sie oder Du), Kontostatus.
- **Anmeldung:** mit einem 6-stelligen Code oder Link per E-Mail. Die E-Mails verschickt Brevo (Abschnitt 12). Beim Anmelden speichert unser Anmeldedienst (Supabase Auth) Sitzungsdaten, laut Supabase auch IP-Adresse und Browser-Kennung [[prüfen]].
- **Zweck und Grundlage:** Durchführung des Nutzungsvertrags (Art. 6 Abs. 1 lit. b DSGVO); Schutz des Kontos (Art. 6 Abs. 1 lit. f DSGVO).
- **Dauer:** bis zur Löschung Ihres Kontos. Nehmen Sie eine Einladung nicht innerhalb von 7 Tagen an, löschen wir das vorbereitete Konto automatisch. Sobald Sie die Einladung angenommen haben, löschen wir Ihren Eintrag auf der Warteliste; Ihr Gründungsstatus steht dann in Ihrem Konto.
- **Anmeldeprotokolle:** Unser Anmeldedienst protokolliert Anmeldungen mit IP-Adresse. Diese Einträge löschen wir nach 30 Tagen [[Frist bestätigen]].

## 5. Einwilligungen und deren Nachweis

Bevor Sie Angaben machen, fragen wir einzelne Einwilligungen ab. Jede Erteilung und jeden Widerruf speichern wir
mit Zeitpunkt und Fassung des Textes. So können wir nachweisen, wozu Sie eingewilligt haben (Art. 7 Abs. 1 DSGVO,
Art. 6 Abs. 1 lit. c DSGVO). Die Texte der Einwilligungen finden Sie in der App unter „Rechtliches“.

Sie können jede Einwilligung einzeln in der App unter „Konto → Einwilligungen“ widerrufen. Der Widerruf gilt für die
Zukunft. Was dann geschieht, steht bei der jeweiligen Verarbeitung.

## 6. Ihre Angaben im Formular

- **Daten:** Vor- und Nachname, Geburtsdatum, Postleitzahl, Ort, freiwillig Telefonnummer. Die Straße fragen wir nicht ab [[Frage B1: so lassen]].
- **Zweck:** Abgleich mit Ihrem Ausweis, Altersprüfung (ab 18), Kontakttausch (nur Telefon, nur wenn Sie es wollen). Für die Auswahl nutzen wir **nur den Mittelpunkt Ihrer Postleitzahl**, nie Ihre Anschrift. Die PLZ-Mittelpunkte liegen in unserer Datenbank; es wird kein externer Kartendienst gefragt. Quelle: Postleitzahlen: GeoNames (geonames.org), Lizenz CC BY 4.0, aufbereitet von zauberware/postal-codes-json-xml-csv.
- **Grundlage:** Art. 6 Abs. 1 lit. b DSGVO.
- **Nach der Ausweisprüfung** lassen sich Name und Geburtsdatum nicht mehr ändern (sonst wäre die Prüfung wertlos). Bei Fehlern wenden Sie sich an uns.
- **Dauer:** bis zur Löschung Ihres Kontos.

## 7. Besonders geschützte Angaben (Art. 9 DSGVO)

### 7.1 Geschlecht, gesuchtes Geschlecht, Orientierung

Damit wir Ihnen ein passendes Gegenüber vorschlagen können, fragen wir nach Ihrem Geschlecht und danach, wen Sie
kennenlernen möchten; freiwillig nach Ihrer Orientierung. Diese Angaben lassen Rückschlüsse auf Ihre sexuelle
Orientierung zu (EuGH, Urteil vom 01.08.2022, C-184/20) und sind deshalb besonders geschützt.

- **Grundlage:** Ihre ausdrückliche Einwilligung „Geschlecht und gesuchtes Geschlecht“ (Art. 9 Abs. 2 lit. a, Art. 6 Abs. 1 lit. a DSGVO). Wir fragen sie **vor** dem Formular.
- **Schutz:** Die Angaben liegen verschlüsselt (AES-256) in einem eigenen Bereich der Datenbank. Der Schlüssel liegt getrennt in einem Schlüsseltresor. Das Auswahlprogramm sieht die Angaben nie; es erhält nur die Antwort „passt“ oder „passt nicht“. Das Sprachmodell erhält sie nie. Auch Fermata-Mitarbeitende sehen sie in der Verwaltung nicht.
- **Statistik zur Fairness:** Nach jedem Auswahl-Lauf zählen wir, wie viele Menschen je Geschlecht und je Altersgruppe einen Vorschlag bekamen – nur als Summen, nie gekreuzt, Gruppen unter 5 Personen werden unterdrückt. So erkennen wir, ob die Auswahl Gruppen benachteiligt. [[Anwalt: Zweck „Fairness-Prüfung“ in den Einwilligungstext aufnehmen oder auf Art. 9 Abs. 2 lit. a in Verbindung mit dieser Erklärung stützen]]
- **Widerruf:** Wir löschen die Angaben sofort. Ohne sie können wir Ihnen keine Abende vorschlagen.

### 7.2 Religion (freiwillig)

Wenn Ihnen Religion bei einem Gegenüber wichtig ist, können Sie Ihre Religion, deren Bedeutung für Sie und den
Wunsch „gleiche Religion“ angeben. Grundlage: ausdrückliche Einwilligung (Art. 9 Abs. 2 lit. a DSGVO). Schutz wie in
7.1; die Auswahl erhält nur „passt“ oder „passt nicht“, und nur dann, wenn eine der beiden Personen gleiche Religion
verlangt. Widerruf: sofortige Löschung.

### 7.3 Gesundheit

Wir fragen in der App **keine Gesundheitsangaben** ab und speichern keine. Was Sie im Gespräch von sich aus dazu
erzählen, behandeln wir wie in 7.4 beschrieben.

### 7.4 Was Sie im Gespräch von sich aus erzählen

Viola fragt nie nach Gesundheit, Religion, Weltanschauung, politischer Meinung, Gewerkschaft, Herkunft,
Sexualität, Geschlecht, genetischen oder biometrischen Daten oder Straftaten. Erzählen Sie davon von sich aus, wird
das **während des Gesprächs** wie alles Gesagte von der Spracherkennung und dem Sprachmodell verarbeitet
(Abschnitt 9). **Gespeichert wird es nicht:** Solche Sätze ersetzen wir im gespeicherten Text durch „[geschützte
Angabe entfernt]“, sie kommen nicht in Ihre Zusammenfassung und nicht in Ihr Profil; die Datenbank lehnt sie beim
Speichern ab. Ausnahme: Beiträge, die auf eine Gefahr hinweisen (zum Beispiel eine Krise), bleiben wörtlich im
Gesprächstext, damit wir helfen können; auch sie werden nach 30 Tagen gelöscht [[Frage B5]]. Grundlage:
[[Anwalt: ausdrückliche Einwilligung im Text „Gespräch mit Viola“ ergänzen (Art. 9 Abs. 2 lit. a) bzw. lit. c für
Krisenfälle]].

## 8. Ausweisprüfung mit Didit

Damit nur echte, volljährige Menschen teilnehmen, prüfen wir einmal Ihren Ausweis. Das übernimmt der Dienst
**Didit** [[genaue Firma, Anschrift, Vertragspartner]].

- **Ablauf:** Sie fotografieren Ihren Ausweis und nehmen ein kurzes Video Ihres Gesichts auf. Didit vergleicht Ihr Gesicht mit dem Ausweisfoto (biometrische Daten, Art. 9 DSGVO) und liest Name, Geburtsdatum und Ausweisnummer aus.
- **Was wir erhalten und speichern:** volljährig ja oder nein, Ihr Geburtsjahr, ob Name und Geburtsdatum mit Ihren Angaben übereinstimmen, die Prüfnummer und den Zeitpunkt. **Keine Bilder, keine Ausweisnummer, keinen Namen aus dem Ausweis.**
- **Sperrlisten-Prüfwerte:** Aus Ausweisnummer und Geburtsdatum sowie aus Name und Geburtsdatum bilden wir Prüfwerte (HMAC-SHA256 mit geheimem Schlüssel), die sich nicht zurückrechnen lassen. Wir vergleichen sie mit unserer Sperrliste ausgeschlossener Personen und speichern sie, damit ein späterer Ausschluss auch bei einem neuen Konto wirkt (Abschnitt 14).
- **Löschung bei Didit:** Direkt nach dem Ergebnis beauftragen wir Didit, die Prüfung zu löschen; zusätzlich ist bei Didit die kürzeste Aufbewahrung (1 Monat) eingestellt [[nach Einrichtung bestätigen]].
- **Grundlage:** biometrischer Abgleich: Ihre ausdrückliche Einwilligung „Ausweisprüfung“ (Art. 9 Abs. 2 lit. a DSGVO); Ergebnis und Prüfwerte: Vertrag (Art. 6 Abs. 1 lit. b) und Schutz aller Mitglieder (Art. 6 Abs. 1 lit. f).
- **Drittland:** Didit verarbeitet laut eigener Auskunft in der EU, hat seinen Sitz aber in den USA. Ein Zugriff von US-Behörden lässt sich deshalb nicht ausschließen. [[Grundlage der Übermittlung: Data Privacy Framework oder Standardvertragsklauseln eintragen]]
- **Ohne Biometrie:** [[Frage B2: Alternative, z. B. persönliche Prüfung; bis dahin: „Ohne Ausweisprüfung können wir Ihnen keine Abende vorschlagen.“]]
- **Dauer bei uns:** Ergebnis und Prüfwerte bis zur Löschung Ihres Kontos.

## 9. Das Gespräch mit Viola

Viola ist eine **Stimme mit künstlicher Intelligenz**, ohne Gesicht. Sie sagt das zu Beginn jedes Gesprächs, und
die App zeigt es vor dem Verbinden an (Art. 50 KI-Verordnung, siehe ki-hinweis.md). Viola fragt nach
Persönlichkeit, Werten, Wünschen an ein Gegenüber, Lebensumständen, Fahrbereitschaft und freien Zeiten. Sie können
statt zu sprechen auch schreiben.

**Ablauf der Daten im Gespräch:**

1. Ihre Stimme geht über eine verschlüsselte Sprachverbindung (LiveKit [[Weg A, B oder C, Frage B3]]) zu Viola. Viola läuft auf Servern von Amazon Web Services in Frankfurt.
2. Die Spracherkennung **Deepgram** (EU-Server) macht daraus Text. Stille wird nicht übertragen. Deepgram nutzt die Daten laut Vertrag nicht zur Verbesserung eigener Modelle (Einstellung mip_opt_out).
3. Das Sprachmodell **Claude Sonnet 5.5** (Anthropic) über **Amazon Bedrock** in der EU formuliert Violas Antwort. [[EU-Geo-Profil: Anfragen können auf Rechenzentren in der EU sowie in London und Zürich verteilt werden; Vereinigtes Königreich und Schweiz haben einen Angemessenheitsbeschluss der EU-Kommission. Oder: regional nur Frankfurt – je nach Entscheidung.]] Amazon speichert die Anfragen laut Vertrag nicht und nutzt sie nicht zum Training [[im AV-Vertrag bestätigen]].
4. Die Stimme von Viola erzeugt **Amazon Polly** in Frankfurt [[Frage B4: Ergebnis des Blindtests eintragen]].

**Was gespeichert wird:**

- Ihre Stimme (Audio) – Wo: **nirgends**
- Text des Gesprächs (Ihre und Violas Beiträge), geschützte Angaben ersetzt – Wo: Datenbank Frankfurt · Wie lange: **30 Tage**, dann automatisch gelöscht; bei Widerruf der Einwilligung sofort
- Ablauf des Gesprächs (Art, Dauer, Zeitpunkt des KI-Hinweises, Ende-Grund) – Wo: Datenbank · Wie lange: bis zur Löschung Ihres Kontos
- Entwurf der Zusammenfassung – Wo: Datenbank · Wie lange: 30 Tage nach Bestätigung, Korrektur, Verwerfen oder Ende des Gesprächs, dann geleert
- Bestätigte Zusammenfassung, daraus abgeleitetes Profil (Persönlichkeit, Werte, Wünsche, Ausschlüsse, Lebensumstände, Fahrbereitschaft) – Wo: Datenbank · Wie lange: bis zur Löschung Ihres Kontos; Sie können die Zusammenfassung jederzeit korrigieren
- Kosten und Antwortzeiten des Gesprächs (ohne Inhalte) – Wo: Datenbank · Wie lange: dauerhaft, nach Löschung Ihres Kontos ohne Bezug zu Ihnen
- Hinweis auf eine mögliche Gefahr (Art des Hinweises, keine Zitate) – Wo: Datenbank, nur für die Sicherheitsprüfung · Wie lange: siehe Abschnitt 14

**Auswertung:** Nach dem Gespräch wertet ein zweiter Durchgang desselben Sprachmodells den Gesprächstext aus und
schlägt eine Zusammenfassung vor. **Sie lesen sie und bestätigen, korrigieren oder verwerfen sie.** Erst die
bestätigte Fassung nutzen wir für die Auswahl.

**Sicherheit im Gespräch:** Erkennt Viola Hinweise auf eine Krise, auf Minderjährigkeit, Gewalt oder Belästigung,
nennt sie Hilfsangebote, beendet das Gespräch, wenn nötig, und hinterlässt uns einen Hinweis ohne Freitext. Den
Gesprächstext liest bei Fermata nur [[Benn]] und nur, solange zu Ihrem Konto ein offener Sicherheitshinweis oder eine
offene Meldung besteht; dafür ist eine Zwei-Faktor-Anmeldung und eine schriftliche Begründung nötig, und jede
Einsicht wird protokolliert (ohne den Inhalt).

**Grundlage:** Ihre Einwilligung „Gespräch mit Viola“ (Art. 6 Abs. 1 lit. a DSGVO) [[und für in Abschnitt 7.4
genannte Inhalte Art. 9 Abs. 2 lit. a]]; das bestätigte Profil: Vertrag (Art. 6 Abs. 1 lit. b), weil es für die
Vorschläge nötig ist; Sicherheitshinweise: Art. 6 Abs. 1 lit. d und f.
**Widerruf:** Wir löschen alle gespeicherten Gesprächstexte sofort. Ihr bestätigtes Profil bleibt, bis Sie es
korrigieren oder Ihr Konto löschen [[Anwalt prüfen, ob das Profil beim Widerruf ebenfalls zu löschen ist]].

## 10. Die Auswahl: wie Vorschläge entstehen (Profiling, Art. 22 DSGVO)

In der Testphase sucht ein Programm alle 14 Tage für möglichst viele Mitglieder genau ein Gegenüber und ein Lokal
möglichst in der Mitte. Das ist **Profiling** im Sinne von Art. 4 Nr. 4 DSGVO.

**Wer in die Auswahl kommt:** Konto aktiv, Ausweis geprüft, Einwilligungen „Gespräch“ und „Geschlecht“ erteilt,
Zusammenfassung bestätigt, keine Sperre, freie Zeiten eingetragen, ein freier Abend im Kontingent, kein laufender
Abend.

**Wie bewertet wird:**

1. **Feste Regeln:** Entfernung (Luftlinie zwischen den PLZ-Mittelpunkten, höchstens Ihre Fahrbereitschaft), Altersbereich, gemeinsame Sprache, Ihre Ausschlüsse (zum Beispiel Rauchen), nicht blockiert, gemeinsame freie Zeit, ein Lokal mit freiem Tisch, Geschlecht und gegebenenfalls Religion (nur „passt / passt nicht“).
2. **Teilwerte** nach festen Formeln für Werte, Wünsche, Persönlichkeit, Lebensumstände und gemeinsame Zeiten.
3. **Sprachmodell:** Für die aussichtsreichsten Paare bewertet Claude Sonnet 5.5 nach einer festen Rubrik, ob die beiden zusammenpassen könnten, und schreibt einen Entwurf „Warum Sie beide“. Es erhält dafür je Person Alter, bestätigte Zusammenfassung (ohne Namen, Geschlechtshinweise neutralisiert), Werte, Wünsche, Lebensumstände, Rauchen, Kinder, Kinderwunsch, Sprachen, auf 5 km gerundete Entfernung. **Nie:** Namen, Anschrift, PLZ, Geschlecht, Orientierung, Religion, Gesundheit.
4. **Zuordnung:** Eine Rechnung bildet möglichst viele Paare mit möglichst hoher Gesamtbewertung; wer lange gewartet hat, bekommt einen kleinen Vorrang.
5. **Prüfung:** Ein zweiter Durchgang des Sprachmodells und ein fester Wortfilter prüfen den Text „Warum Sie beide“ auf geschützte Inhalte; bei einem Treffer wird ein neutraler Text verwendet.
6. **Menschliche Entscheidung:** Benn [[Name/Funktion]] sieht jeden Vorschlag mit Bewertung, Begründung und Hinweisen und **gibt ihn frei oder lehnt ihn ab**. Erst mit der Freigabe erhalten Sie einen Vorschlag.

**Einordnung nach Art. 22 DSGVO:** Die Entscheidung, Ihnen einen Vorschlag zu machen, trifft ein Mensch, der den
Vorschlag inhaltlich prüft und ablehnen kann. Nicht von einem Menschen geprüft wird dagegen, **wer keinen Vorschlag
bekommt**, weil feste Regeln oder die Bewertung kein passendes Gegenüber ergeben. Wir halten das nicht für eine
Entscheidung mit rechtlicher oder ähnlich erheblicher Wirkung, weil daraus keine Kosten entstehen: Findet in einem
bezahlten Zeitraum aus Gründen, die nicht bei Ihnen liegen, kein Abend statt, verlängert sich der Zeitraum ohne
Zahlung um 4 Wochen. [[Anwalt prüfen; soweit Art. 22 doch greift: Art. 22 Abs. 2 lit. a/c und Abs. 4 – die
Art.-9-Prüfung beruht auf Ihrer ausdrücklichen Einwilligung.]]

**Ihre Möglichkeiten:** Sie können jederzeit verlangen, dass ein Mensch Ihre Situation ansieht, Ihren Standpunkt
darlegen und eine Erklärung erhalten, warum Sie (noch) keinen Vorschlag bekommen haben. Schreiben Sie dazu an
[[Kontakt]].

**Grundlage:** Art. 6 Abs. 1 lit. b DSGVO; für die Ja/Nein-Prüfung zu Geschlecht und Religion Ihre Einwilligung nach
Art. 9 Abs. 2 lit. a.
**Dauer:** Teilwerte, Gesamtbewertung und Prüfnotizen der Bewertung 12 Monate; Bericht je Lauf (Summen, keine
Einzelpersonen) dauerhaft; Ihr Vorschlag (ohne Bewertung) bis zur Löschung Ihres Kontos oder des Kontos Ihres
Gegenübers.

## 11. Abende

- Zeitenabfrage – Welche Daten: Ihre freien Zeitfenster je Zeitraum · Wer sieht was: nur Sie und die Auswahl; gelöscht 30 Tage nach Ende des Zeitraums
- Vorschlag und Terminabstimmung – Welche Daten: Lokal, Uhrzeiten, Ihre Wunschzeiten, Fristen · Wer sieht was: Sie beide; Ihr Gegenüber sieht Ihren **Vornamen** und den Text „Warum Sie beide“
- Reservierung – Welche Daten: Datum, Uhrzeit, Name „Fermata“, 4-stelliger Tisch-Code, 2 Personen · Wer sieht was: das Lokal – **nie Ihr Name oder Ihre Kontaktdaten**
- Finde-Fenster (15 Minuten vor bis 45 Minuten nach Beginn) – Welche Daten: Tisch-Code, Vorname, freiwilliges Erkennungszeichen (z. B. „dunkelblauer Schal“) · Wer sieht was: Ihr Gegenüber, nur in diesem Zeitfenster; das Erkennungszeichen löschen wir danach
- Check-in 30 Minuten nach Beginn – Welche Daten: „alles gut“, „unsicher“ oder „Hilfe“ · Wer sieht was: Fermata; bei „Hilfe“ sofortige Nachricht an [[Benn/Sicherheitskontakt]]
- Abend teilen – Welche Daten: ein Link für eine Vertrauensperson mit Lokal, Adresse, Uhrzeit, Ihrem Vornamen · Wer sieht was: die Person, der Sie den Link geben; nichts über Ihr Gegenüber; ungültig 24 Stunden nach Beginn oder wenn Sie ihn zurückziehen
- Rückmeldung am nächsten Tag – Welche Daten: war ich da, war das Gegenüber da, sicher gefühlt, Bewertungen, Notiz, Kontakt ja/nein · Wer sieht was: Fermata; **nie Ihr Gegenüber**
- Kontakttausch – Welche Daten: E-Mail und/oder Telefon, nur wenn Sie **beide** „Ja“ sagen · Wer sieht was: Ihr Gegenüber, nur in der App, nie per E-Mail; ein „Nein“ sieht niemand. Nach einem Widerruf zeigt die App Ihre Daten nicht mehr an; was Ihr Gegenüber schon notiert hat, können wir nicht zurückholen
- Blockieren – Welche Daten: wer wen blockiert · Wer sieht was: niemand außer Ihnen und der Auswahl

**Grundlage:** Vertrag (Art. 6 Abs. 1 lit. b); Check-in und Hilfe: Art. 6 Abs. 1 lit. d und f; Kontakttausch: Ihre
Einwilligung „Kontakt teilen“ (Art. 6 Abs. 1 lit. a), die Sie für jeden Abend durch Ihr „Ja“ bestätigen.
**Dauer:** bis zur Löschung Ihres Kontos. Löscht Ihr Gegenüber sein Konto, sagen wir offene Abende ab (Sie erhalten
eine neutrale Nachricht und Ihren Abend zurück), und der gemeinsame Abend entfällt samt Rückmeldungen [[Benn/Anwalt:
so lassen?]].

**Partner-Lokale** erhalten von uns keine Daten über Sie außer der Reservierung oben. Was Sie im Lokal bestellen und
bezahlen, regelt das Lokal selbst.

## 12. Nachrichten per E-Mail und Mitteilung

- **E-Mail:** Anmeldecodes, Bestätigungen, Fristen, Erinnerungen, Sicherheitsnachrichten und Eingangsbestätigungen verschickt **Brevo** (Sendinblue SAS, Paris, Frankreich). Öffnungs- und Klickverfolgung sind ausgeschaltet. Mails nennen Ihr Gegenüber nicht beim Namen.
- **Mitteilungen (Web-Push):** nur mit Ihrer Einwilligung „Mitteilungen“. Sie laufen über den Dienst Ihres Browser- oder Geräteherstellers (Apple, Google oder Mozilla, Sitz USA). Der Inhalt ist Ende-zu-Ende verschlüsselt; der Dienst sieht nur die Adresse Ihres Abos und den Zeitpunkt. Die Texte sind kurz und enthalten keine Namen. Zwischen 22 und 8 Uhr schicken wir keine Mitteilungen außer zur Sicherheit.
- **Protokoll:** Wir speichern, welche Nachricht wann über welchen Weg verschickt wurde – ohne Inhalt und ohne Adresse – für 12 Monate [[Frist bestätigen]]. Sicherheits-Mails löschen wir 30 Tage nach dem Versand aus unserem Ausgang.
- **Grundlage:** Vertrag (Art. 6 Abs. 1 lit. b); Mitteilungen: Einwilligung (Art. 6 Abs. 1 lit. a, § 25 Abs. 1 TDDDG). Widerruf: Wir löschen Ihre Push-Abos sofort.

## 13. Mitgliedschaft und Zahlung

Bis einschließlich zu Ihrem ersten Abend ist Fermata kostenlos, ohne Zahlungsdaten. Danach können Sie eine
Mitgliedschaft abschließen.

- **Bei uns:** Stufe, Status, Vertragsnummer, Zeiträume, Kontingent an Abenden, Bestellung (die angezeigte Übersicht und der Knopftext), Kündigung und Widerruf mit Zeitpunkt, Name und Kontakt-E-Mail, Eingangsbestätigungen; Kennungen von Kunde, Abo und Rechnung bei Stripe.
- **Bei Stripe** (Stripe Payments Europe Ltd., Dublin, Irland): Ihre Zahlungsdaten geben Sie direkt bei Stripe ein; sie erreichen Fermata nie. Stripe erhält von uns Ihre E-Mail-Adresse und eine interne Kennung. Nachrichten von Stripe an uns speichern wir ohne Karten-, Adress-, Telefon-, Namens- und E-Mail-Angaben und ohne Rechnungslinks und löschen sie nach 13 Monaten [[Frist bestätigen]]. Stripe verarbeitet Daten teilweise in eigener Verantwortung (zum Beispiel zur Betrugsvorbeugung) und kann Daten an Stripe, Inc. (USA) übermitteln [[Grundlage und Datenschutzhinweise von Stripe verlinken]].
- **Grundlage:** Vertrag (Art. 6 Abs. 1 lit. b); Aufbewahrung von Vertrags- und Buchungsunterlagen: gesetzliche Pflicht (Art. 6 Abs. 1 lit. c i. V. m. § 257 HGB, § 147 AO).
- **Bestellung und Widerrufsrecht:** Bei der Bestellung verlangen Sie ausdrücklich, dass wir vor Ende der Widerrufsfrist beginnen. Diese Erklärung speichern wir mit Wortlaut, Fassung und Zeitpunkt als Nachweis.
- **Konto löschen:** Löschen Sie Ihr Konto während einer laufenden Mitgliedschaft, beenden wir das Abo bei Stripe sofort und halten das Ende des Vertrags fest (Vertragsnummer, Zeitpunkt, Grund „Konto gelöscht“, ohne Name und E-Mail-Adresse).
- **Dauer:** bis zur Löschung Ihres Kontos. Unterlagen zu Bestellung, Kündigung und Widerruf (bei Kündigung und Widerruf mit dem Namen und der Kontakt-E-Mail, die Sie im Formular angegeben haben) bewahren wir auch danach auf, ohne Verknüpfung mit Ihrem Konto, weil wir den Eingang und die Wirkung dieser Erklärungen nachweisen müssen (Art. 6 Abs. 1 lit. c und f DSGVO): [[3 Jahre ab Ende des Jahres, in dem der Vertrag endete (regelmäßige Verjährung, § 195 BGB); soweit es Handels- oder Geschäftsbriefe bzw. Buchungsbelege sind, 6 bzw. 8 Jahre (§ 257 HGB, § 147 AO) – Steuerberatung bestätigen]]. Anfragen zur Kündigung oder zum Widerruf ohne Anmeldung löschen wir 30 Tage nach Bestätigung oder Ablauf des Links.

## 14. Sicherheit: Meldungen, Sperren, Sperrliste

- **Meldungen:** Sie können überall in der App etwas melden. Wir speichern, wer was zu wem meldet, die Schilderung und unsere Entscheidung. **Die gemeldete Person erfährt nie, wer gemeldet hat.** Wir prüfen Meldungen in der Regel innerhalb von 24 Stunden.
- **Vorläufige Sperre:** Bei schweren Vorwürfen (Übergriff, Bedrohung, Verdacht auf Minderjährigkeit) sperren wir das gemeldete Konto sofort vorläufig, sagen offene Abende ohne Angabe von Gründen ab und prüfen dann. Die betroffene Person kann widersprechen.
- **Sperrliste:** Wer ausgeschlossen wird, kommt auf eine Sperrliste, die **nur Prüfwerte** enthält (siehe Abschnitt 8). Ein Treffer mit dem Prüfwert aus der Ausweisnummer sperrt ein neues Konto automatisch; ein Treffer nur beim Namen führt zu einer Prüfung durch einen Menschen. Die Sperrliste bewahren wir dauerhaft auf, solange der Ausschluss gilt [[Anwalt: Dauer begründen, siehe DSFA]].
- **Weitergabe an die Polizei:** Nur wenn Fermata nach Rücksprache mit der betroffenen Person Anzeige erstattet. Dann geben wir die nötigen Angaben (Sachverhalt, Name, Geburtsdatum, Wohnort der beschuldigten Person) an die Polizei weiter. Grundlage: Art. 6 Abs. 1 lit. f DSGVO, § 24 Abs. 1 Nr. 1 BDSG [[Anwalt prüfen, auch Art. 10 DSGVO]].
- **Grundlage:** Schutz aller Mitglieder (Art. 6 Abs. 1 lit. f), Nutzungsbedingungen (lit. b); bei Gefahr für Leib und Leben lit. d. Meldungen können besonders geschützte Angaben oder Angaben zu Straftaten enthalten [[Anwalt: Art. 9 Abs. 2 lit. f, Art. 10 DSGVO]].
- **Dauer:** abgeschlossene Meldungen 24 Monate nach der Entscheidung, solange keine Sperre aus dieser Meldung mehr gilt; geprüfte Sicherheitshinweise 24 Monate nach der Prüfung [[beide Fristen bestätigen]]; Sperren bis zum Ende bzw. zur Kontolöschung; Sperrliste, solange der Ausschluss gilt.

## 15. Verwaltung, Protokolle, Sicherungen

- Verwaltungsaufgaben erledigt nur [[Benn]] mit Zwei-Faktor-Anmeldung. Jede Freigabe, jede Einsicht in eine Meldung oder ein Konto und jede Änderung von Einstellungen protokollieren wir (Handlung, Zeit, handelnde Person). Grundlage: Art. 6 Abs. 1 lit. c und f i. V. m. Art. 5 Abs. 2, Art. 32 DSGVO. Das Protokoll enthält keine Inhalte (keine Gesprächstexte, keine Schilderungen), nur Kennungen. Dauer: [[festlegen; heute dauerhaft, weil das Protokoll nur angehängt und nie geändert werden kann]].
- Server-Protokolle (Supabase, Vercel, Amazon Web Services) enthalten technische Daten wie IP-Adressen. Dauer: [[laut Verträgen eintragen]].
- Die Datenbank wird regelmäßig gesichert [[Tarif, Dauer]]. Gelöschte Daten verschwinden aus den Sicherungen mit deren Ablauf.

## 16. Empfänger und Auftragsverarbeiter

- Supabase [[Vertragspartner]] – Aufgabe: Datenbank, Anmeldung, Server-Funktionen · Ort: Frankfurt am Main (AWS)
- Vercel Inc. – Aufgabe: Auslieferung der Web-App · Ort: Funktionen Frankfurt, Auslieferung weltweit; Sitz USA
- Sendinblue SAS (Brevo) – Aufgabe: E-Mail-Versand · Ort: Frankreich
- Amazon Web Services EMEA SARL – Aufgabe: Viola, Auswahl-Programm, Sprachmodell (Bedrock), Stimme (Polly), Protokolle · Ort: Frankfurt; EU-Geo-Profil siehe Abschnitt 9
- Deepgram [[Vertragspartner]] – Aufgabe: Spracherkennung · Ort: EU-Server; Sitz USA
- LiveKit [[nur bei Weg A/B]] – Aufgabe: Sprachverbindung · Ort: [[EU-Region]]; Sitz USA
- Didit [[Vertragspartner]] – Aufgabe: Ausweisprüfung · Ort: EU laut Didit; Sitz USA
- Stripe Payments Europe Ltd. – Aufgabe: Zahlung · Ort: Irland; teils eigene Verantwortung
- Apple, Google, Mozilla – Aufgabe: Zustellung verschlüsselter Mitteilungen · Ort: USA
- Partner-Lokale – Aufgabe: Reservierung ohne Namen · Ort: Westmecklenburg
- Polizei – Aufgabe: nur bei Anzeige (Abschnitt 14) · Ort: Deutschland

Einzelheiten und Vertragsstand: av-liste.md.

## 17. Übermittlung in Drittländer

Wir wählen Anbieter und Einstellungen so, dass Ihre Daten in der EU verarbeitet werden. Einige Anbieter haben ihren
Sitz in den USA oder nutzen Rechenzentren außerhalb der EU:

- **Vereinigtes Königreich und Schweiz:** möglich beim EU-Geo-Profil von Amazon Bedrock; für beide Länder gibt es einen Angemessenheitsbeschluss der EU-Kommission (Art. 45 DSGVO).
- **USA:** Anbieter mit Sitz oder Mutterunternehmen in den USA (Supabase, Vercel, Amazon, Deepgram, Didit, LiveKit, Stripe, Apple/Google/Mozilla). Grundlage: [[je Anbieter: Angemessenheitsbeschluss EU-US Data Privacy Framework (Art. 45), sofern zertifiziert, sonst Standardvertragsklauseln (Art. 46 Abs. 2 lit. c)]]. Auch bei Verarbeitung in der EU ist ein Zugriff von US-Behörden nicht ausgeschlossen.

## 18. Speicherdauer im Überblick

- Konto, Angaben, Profil, Einwilligungen, Abende – Dauer: bis zur Löschung Ihres Kontos
- Besonders geschützte Angaben – Dauer: bis zum Widerruf der Einwilligung oder zur Kontolöschung
- Gesprächstext – Dauer: 30 Tage
- Entwurf der Zusammenfassung – Dauer: 30 Tage nach Bestätigung oder Ende des Gesprächs
- Freie Zeitfenster – Dauer: 30 Tage nach Ende des Zeitraums
- Wartelisten-Eintrag – Dauer: bis Sie die Einladung in die App angenommen haben
- Anmeldeprotokolle mit IP-Adresse – Dauer: 30 Tage
- Stimme – Dauer: wird nicht gespeichert
- Ausweisbilder und -video – Dauer: nur bei Didit, gelöscht direkt nach dem Ergebnis
- Teilwerte, Gesamtbewertung und Prüfnotizen der Auswahl – Dauer: 12 Monate
- Erkennungszeichen – Dauer: bis zum Ende des Finde-Fensters
- Erledigte Nachrichten in der Warteschlange – Dauer: 90 Tage
- Versandprotokoll (ohne Inhalt) – Dauer: 12 Monate
- Sicherheits-Mails im Ausgang – Dauer: 30 Tage nach Versand
- Nachrichten von Stripe (gekürzt) – Dauer: 13 Monate
- Vertragsunterlagen – Dauer: [[3 Jahre bzw. 6 oder 8 Jahre, siehe Abschnitt 13]]
- Meldungen, Hinweise, Sanktionen, Sperrliste – Dauer: siehe Abschnitt 14

Das vollständige Löschkonzept: loeschkonzept.md.

## 19. Ihre Rechte

- **Auskunft** (Art. 15) und **Datenübertragbarkeit** (Art. 20): In der App unter „Konto → Meine Daten“ laden Sie alle über Sie gespeicherten Daten als Datei herunter (ohne Daten über andere Menschen).
- **Berichtigung** (Art. 16): Angaben ändern Sie in der App; Ihre Zusammenfassung korrigieren Sie jederzeit. Name und Geburtsdatum nach der Ausweisprüfung ändern wir auf Anfrage.
- **Löschung** (Art. 17): In der App unter „Konto → Konto löschen“. Wir löschen alles, was nicht aus gesetzlichen Gründen aufbewahrt werden muss. Eine laufende Mitgliedschaft endet dabei sofort, offene Abende sagen wir ab.
- **Einschränkung** (Art. 18) und **Widerspruch** (Art. 21) gegen Verarbeitungen auf Grundlage berechtigter Interessen: per E-Mail an [[Kontakt]].
- **Widerruf von Einwilligungen** (Art. 7 Abs. 3): jederzeit einzeln unter „Konto → Einwilligungen“, mit Wirkung für die Zukunft.
- **Menschliche Prüfung** bei der Auswahl (Art. 22 Abs. 3): siehe Abschnitt 10.
- **Beschwerde** bei einer Aufsichtsbehörde (Art. 77), zum Beispiel beim Landesbeauftragten für Datenschutz und Informationsfreiheit Mecklenburg-Vorpommern [[zuständige Behörde nach Sitz prüfen]].

## 20. Müssen Sie Daten angeben?

Ohne E-Mail-Adresse, Formularangaben, Angaben zu Geschlecht und gesuchtem Geschlecht und ohne Ausweisprüfung können
wir Ihnen keine Abende vorschlagen. Das Gespräch mit Viola ist nötig, damit wir Sie kennenlernen. Religion,
Orientierung, Telefonnummer, Mitteilungen und Kontakttausch sind freiwillig.

## 21. Änderungen

Wir passen diese Erklärung an, wenn sich Fermata ändert. Die jeweils gültige Fassung steht in der App unter
„Rechtliches“. Ändert sich eine Einwilligung, fragen wir Sie neu.

*Entwurf vom 03.10.2026. Der verbindliche Text folgt nach rechtlicher Prüfung.*$md$),

-- Quelle: docs/recht/agb.md
('agb', '2026-10-03-entwurf', 'entwurf', 'Nutzungsbedingungen',
$md$## § 1 Worum es geht, wer Vertragspartner ist

1. Fermata verabredet Abende zwischen zwei Menschen in Partner-Lokalen, zunächst in Westmecklenburg. Es gibt kein Wischen, keinen Feed und keinen freien Chat. Ein Programm schlägt nach einem Gespräch mit Viola, einer künstlichen Intelligenz, ein Gegenüber und ein Lokal vor; ein Mensch prüft jeden Vorschlag, bevor Sie ihn erhalten.
2. Vertragspartner ist [[Name/Firma, Anschrift laut Impressum]] („Fermata“, „wir“).
3. Diese Bedingungen gelten für die Web-App, das Gespräch mit Viola, die Vorschläge und Abende und die Mitgliedschaft. Abweichende Bedingungen der Mitglieder gelten nicht.

## § 2 Wer teilnehmen kann

1. Sie sind mindestens **18 Jahre** alt und handeln als Verbraucherin oder Verbraucher, nicht gewerblich.
2. Teilnahme nur mit **persönlicher Einladung**. Je Person ist ein Konto erlaubt.
3. Ihre Angaben (Name, Geburtsdatum, Postleitzahl) müssen wahr sein. Name und Geburtsdatum werden mit Ihrem Ausweis abgeglichen und sind danach nicht mehr selbst änderbar.
4. Personen, die von Fermata ausgeschlossen wurden, dürfen kein neues Konto anlegen (§ 9 Abs. 5).

## § 3 Ausweisprüfung

1. Bevor wir Ihnen ein Gespräch mit Viola und Abende anbieten, prüfen wir einmal Ihren Ausweis über den Dienst Didit. Dabei wird Ihr Gesicht mit dem Ausweisfoto verglichen. Das setzt Ihre ausdrückliche Einwilligung voraus (siehe Datenschutzerklärung).
2. Die Prüfung ist bestanden, wenn Sie volljährig sind und Name und Geburtsdatum mit Ihren Angaben übereinstimmen. Sie haben höchstens **3** Versuche; danach prüfen wir von Hand.
3. [[Frage B2: Alternative ohne Biometrie – bis zur Entscheidung: „Ohne Ausweisprüfung ist eine Teilnahme nicht möglich.“]]

## § 4 Das Gespräch mit Viola und Ihr Profil

1. Viola ist eine künstliche Intelligenz, kein Mensch. Sie fragt nach Persönlichkeit, Werten, Wünschen, Lebensumständen, Fahrbereitschaft und freien Zeiten. Sie können sprechen oder schreiben.
2. Aus dem Gespräch entsteht eine Zusammenfassung. **Sie bestätigen, korrigieren oder verwerfen sie.** Nur die bestätigte Fassung nutzen wir für Vorschläge.
3. Ein einzelnes Gespräch dauert höchstens 30 Minuten (Text: 60 Minuten) und lässt sich fortsetzen; höchstens 6 Gespräche je Tag. Welche Gesprächsarten Ihnen offenstehen, hängt von der Stufe ab (§ 7).
4. Viola gibt keine Lebens-, Beziehungs-, Rechts-, Medizin- oder Finanzratschläge. In einer Krise nennt sie Hilfsangebote und beendet das Gespräch. Beleidigt oder bedrängt jemand Viola, setzt sie eine Grenze und beendet das Gespräch beim zweiten Mal.

## § 5 Vorschläge und Abende

1. In der Testphase entstehen Vorschläge alle **14 Tage**. Vorher fragen wir Ihre freien Zeiten ab (72 Stunden offen).
2. **Ein Anspruch auf einen Vorschlag besteht nicht.** Ob ein passendes Gegenüber gefunden wird, hängt von den Menschen in Ihrer Nähe, Ihren Wünschen und freien Zeiten und den Plätzen in den Lokalen ab. Zu Folgen für bezahlte Zeiträume siehe § 8 Abs. 5.
3. **Fristen:** Nach einem Vorschlag haben Sie **24 Stunden**, um Wunschzeiten (1 bis 3) zu wählen oder abzulehnen. Ihr Gegenüber hat danach 24 Stunden, um eine Zeit zu bestätigen oder eine Alternative zu nennen; höchstens 4 Runden. Läuft eine Frist ab, endet der Vorschlag.
4. Der Abend findet **nur in einem Partner-Lokal** statt. Wir reservieren unter dem Namen „Fermata“ einen Tisch für 2 Personen mit einem Tisch-Code. Das Lokal erhält keine Namen. [[Frage B10: Wer zahlt Speisen und Getränke? Vorschlag: „Speisen und Getränke bezahlen Sie selbst im Lokal, sofern das Lokal nichts anderes angibt.“]]
5. Absage: Bis **24 Stunden** vor Beginn kostenlos (der Abend geht zurück in Ihr Kontingent). Danach gilt die Absage als kurzfristig und der Abend gilt als genutzt (§ 8 Abs. 3).
6. Nach dem Abend bitten wir Sie am nächsten Tag um 10:00 Uhr um eine kurze Rückmeldung. Ihr Gegenüber sieht sie nie. Sagen beide „Ja“, können Sie Kontaktdaten tauschen; Sie wählen, was Sie teilen. Ein „Nein“ wird nicht angezeigt.
7. Stimmen die Angaben zum Erscheinen nicht überein, entscheidet Fermata nach Prüfung.

## § 6 Kostenlos bis zum ersten Abend

1. Bis **einschließlich zu Ihrem ersten Abend** ist Fermata kostenlos, ohne Zahlungsdaten. Dafür erhalten Sie beim Anlegen des Kontos **einen Gratis-Abend**.
2. Die kostenlose Phase endet, wenn Ihr erster Abend stattgefunden hat oder wenn Sie ihn kurzfristig absagen oder nicht erscheinen. Sagt Ihr Gegenüber ab, läuft sie weiter.
3. Danach erhalten Sie neue Vorschläge nur mit einer Mitgliedschaft (§ 7). Eine Mitgliedschaft entsteht **nie** automatisch; ohne Abschluss entstehen keine Kosten.

## § 7 Mitgliedschaft: Stufen, Preise, Laufzeit

1. **Stufen** je Zeitraum von **4 Wochen** (28 Tage):

- [[Auftakt]] – Preis je 4 Wochen: 49,00 € · Abende je 4 Wochen: 1 · Gesprächsarten: Erstgespräch, Korrektur
- Andante – Preis je 4 Wochen: 149,00 € · Abende je 4 Wochen: 2 · Gesprächsarten: zusätzlich Vertiefung, Nachbesprechung · Nachbesprechung nach dem Abend: [[10 Minuten (B6)]]
- Loge – Preis je 4 Wochen: 299,00 € · Abende je 4 Wochen: 4 ([[in der Testphase höchstens 2]]) · Gesprächsarten: wie Andante · Nachbesprechung nach dem Abend: [[20 Minuten (B6)]]

Die Loge ist in der Testphase [[nicht buchbar (B11)]]. Preise [[inklusive 19 % Umsatzsteuer – oder Hinweis nach
§ 19 UStG (A5)]].
2. **Vertragsschluss:** In der App wählen Sie eine Stufe und sehen eine Übersicht (Stufe, Preis, Laufzeit, Abende, automatische Verlängerung, Kündigung, Widerruf, Verlängerungsregel). Mit Klick auf **„Mitgliedschaft zahlungspflichtig abschließen“** geben Sie ein verbindliches Angebot ab; der Vertrag kommt mit unserer Eingangsbestätigung per E-Mail zustande [[Anwalt: Zeitpunkt des Vertragsschlusses festlegen]]. Sie erhalten eine Vertragsnummer (Form FM-XXXXXXXX). Die angezeigte Übersicht speichern wir als Nachweis.
3. **Zahlung** über Stripe im Voraus je 4 Wochen. Schlägt eine Zahlung fehl, erhalten Sie keine neuen Vorschläge, bis sie nachgeholt ist; bestätigte Abende bleiben bestehen.
4. **Laufzeit:** Die Mitgliedschaft verlängert sich automatisch um jeweils 4 Wochen, bis Sie kündigen (§ 11).
5. Wer schon während der kostenlosen Phase eine Mitgliedschaft abschließt, nutzt für den ersten Abend trotzdem den Gratis-Abend; die bezahlten Abende bleiben vollständig erhalten.

## § 8 Kontingent an Abenden

1. Die Abende Ihrer Stufe stehen Ihnen im jeweiligen Zeitraum zur Verfügung. **Nicht genutzte Abende verfallen am Ende des Zeitraums**, außer in den Fällen von Abs. 5. [[Anwalt: Verfall zulässig?]]
2. Ein Abend wird gebunden, wenn eine Uhrzeit bestätigt ist. Ohne freien Abend lässt sich keine Uhrzeit bestätigen.
3. **Kurzfristige Absage** (weniger als 24 Stunden vorher) oder **Nichterscheinen** verbraucht Ihren Abend. Ihr Gegenüber erhält seinen Abend zurück [[und eine Gutschrift, falls Benn das einschaltet – B9]].
4. **Gutschriften** (zum Beispiel durch Fermata) gelten **3 Monate**.
5. **Verlängerungsregel:** Findet in einem bezahlten Zeitraum **kein Abend** statt und liegt das nicht an Ihnen, verlängert sich der Zeitraum **ohne Zahlung um 4 Wochen**; Ihre übrigen Abende bleiben erhalten. Das geschieht höchstens **einmal je Zeitraum**. An Ihnen liegt es, wenn Sie einen Vorschlag abgelehnt, einen Abend abgesagt, eine Frist verstreichen lassen haben oder nicht erschienen sind. Absagen und Fristversäumnisse Ihres Gegenübers schließen die Verlängerung nicht aus. Die Verlängerung wird 6 Stunden vor Ende des Zeitraums geprüft; bei einer Kündigung verschiebt sich das Vertragsende entsprechend. [[Frage B12: Definition bestätigen]]

## § 9 Verhalten und Sicherheitsstandards

1. **Respekt:** Freundlichkeit, Ehrlichkeit und Respekt gelten am Abend, im Gespräch mit Viola und überall in Fermata. Ein „Nein“ ist ein Nein.
2. **Verboten sind** insbesondere: körperliche oder sexuelle Übergriffe, Drohungen, Belästigung, Diskriminierung, falsche Angaben zur Person, Betrug oder Geldforderungen, Werbung und gewerbliche Anfragen, Teilnahme für eine andere Person, Ton- oder Bildaufnahmen des Gegenübers ohne dessen Einverständnis, Weitergabe von Daten des Gegenübers.
3. **Unsere Sicherheitsstandards** (vollständige Liste in der App unter „Hilfe“): Ausweisprüfung vor dem ersten Abend; Sperrliste; Abende nur an öffentlichen Orten (Partner-Lokale); keine Kontaktdaten vor beidseitigem „Ja“; Melden überall; vorläufige Sperre bei schweren Vorwürfen; Prüfung von Meldungen in der Regel innerhalb von 24 Stunden; Hilfe-Knopf mit Heimwegtelefon und Notruf; „Abend teilen“ mit einer Vertrauensperson; Check-in 30 Minuten nach Beginn; Widerspruch gegen jede Maßnahme; keine Namen in Mitteilungen; eingewiesenes Personal in den Lokalen; Datensparsamkeit (die gemeldete Person erfährt nie, wer gemeldet hat).
4. **Melden:** Sie können jederzeit etwas melden (höchstens 5 Meldungen in 24 Stunden). Bei akuter Gefahr rufen Sie bitte die **110**.
5. **Maßnahmen:** Je nach Schwere: Hinweis; vorläufige Sperre während der Prüfung; Sperre (befristet oder unbefristet); Ausschluss. Bei Übergriffen, Bedrohung oder dem Verdacht auf Minderjährigkeit sperren wir das gemeldete Konto **sofort vorläufig**, wenn sich beide über Fermata kennen, und sagen offene Abende ohne Angabe von Gründen ab. Ein Ausschluss trägt Sie in unsere Sperrliste ein (nur nicht umkehrbare Prüfwerte); ein neues Konto ist dann nicht möglich.
6. Während einer Sperre erhalten Sie keine Vorschläge, und laufende Abstimmungen ruhen. Befristete Sperren enden automatisch.
7. **Strafanzeige:** Bei Straftaten kann Fermata nach Rücksprache mit der betroffenen Person Anzeige erstatten und dafür Angaben an die Polizei weitergeben (siehe Datenschutzerklärung).

## § 10 Widerspruch gegen Maßnahmen

1. Gegen jede Maßnahme können Sie **einmal** in der App Widerspruch einlegen (10 bis 4.000 Zeichen).
2. Ein Mensch prüft den Widerspruch; die Entscheidung erhalten Sie per E-Mail mit Begründung. Wird dem Widerspruch stattgegeben, heben wir die Maßnahme auf.
3. Angaben zur meldenden Person erhalten Sie nicht.

## § 11 Kündigung

1. Sie können die Mitgliedschaft **jederzeit zum Ende des laufenden Zeitraums** kündigen, ohne Angabe von Gründen. Ist die erste Zahlung noch nicht erfolgt, endet der Vertrag sofort.
2. **Kündigungsschaltfläche (§ 312k BGB):** In der App und auf der Website unter **„Verträge hier kündigen“**: Schritt 1 – Vertrag, Name, E-Mail für die Bestätigung, Art (ordentlich oder außerordentlich mit Grund) und Zeitpunkt der Wirksamkeit; Schritt 2 – **„Jetzt kündigen“**. Ohne Anmeldung genügt ein Formular mit E-Mail und Vertragsnummer; Sie erhalten dann einen Bestätigungslink (24 Stunden gültig). Als Zeitpunkt des Eingangs gilt das Absenden des Formulars. [[Anwalt: Ist der zusätzliche Bestätigungslink ohne Anmeldung zulässig?]]
3. Sie erhalten sofort eine **Eingangsbestätigung per E-Mail** mit Datum und Uhrzeit, Vertrag, Art und Zeitpunkt der Wirksamkeit.
4. Das Recht zur außerordentlichen Kündigung aus wichtigem Grund bleibt unberührt. [[Anwalt: Rechtsprechung zur jederzeitigen Kündbarkeit von Partnervermittlungsverträgen als Dienste höherer Art nach § 627 BGB prüfen (BGH, Urteil vom 08.10.2009 – III ZR 93/09, Aktenzeichen bestätigen) und ggf. anteilige Erstattung bei Kündigung vor Ende des Zeitraums vorsehen.]]
5. Fermata kann den Nutzungsvertrag ordentlich mit einer Frist von [[4 Wochen]] kündigen; das Recht zur außerordentlichen Kündigung (insbesondere bei Ausschluss nach § 9) bleibt unberührt.

## § 12 Widerrufsrecht

Verbraucherinnen und Verbraucher haben ein Widerrufsrecht. Einzelheiten stehen in der
Widerrufsbelehrung (in der App unter „Rechtliches“; wir schicken sie Ihnen außerdem mit der
Bestellbestätigung per E-Mail). Der Widerruf ist über die Schaltfläche **„Vertrag widerrufen“** und danach
**„Widerruf bestätigen“** möglich (§ 356a BGB). Bei der Bestellung verlangen Sie ausdrücklich, dass wir vor Ablauf der
Widerrufsfrist beginnen; ohne diese Erklärung ist keine Bestellung möglich. Widerrufen Sie danach und haben Sie
Abende genutzt, zahlen Sie für die genutzten Abende Wertersatz: [[Frage B13: 49,00 € (Auftakt),
74,50 € (Andante), 74,75 € (Loge) je genutztem Abend, höchstens der gezahlte Betrag]]. Den Rest erstatten wir.

## § 13 Konto löschen

Sie können Ihr Konto jederzeit in der App löschen („Konto → Konto löschen“). Eine laufende Mitgliedschaft endet mit
der Löschung sofort; danach buchen wir nichts mehr ab. [[Anwalt/Benn: anteilige Erstattung für den bezahlten,
noch laufenden Zeitraum vorsehen?]] Bereits verabredete oder in Abstimmung befindliche Abende sagen wir ab; Ihr
Gegenüber erhält eine neutrale Nachricht und seinen Abend zurück. Was wir aus gesetzlichen Gründen aufbewahren
(zum Beispiel den Nachweis über das Ende des Vertrags), steht in der Datenschutzerklärung.

## § 14 Haftung

1. Fermata vermittelt die Gelegenheit zu einem Treffen. **Für das Verhalten anderer Mitglieder und der Lokale sind wir nicht verantwortlich.** Wir prüfen Ausweise und Meldungen sorgfältig, können aber nicht garantieren, dass jede Person sich korrekt verhält.
2. Wir haften unbeschränkt bei Vorsatz und grober Fahrlässigkeit, bei Verletzung von Leben, Körper oder Gesundheit und nach dem Produkthaftungsgesetz. Bei leichter Fahrlässigkeit haften wir nur bei Verletzung einer wesentlichen Vertragspflicht und begrenzt auf den vorhersehbaren, typischen Schaden. [[Anwalt prüfen]]
3. Wir bemühen uns um eine hohe Verfügbarkeit. Bei Wartung oder Störungen (zum Beispiel beim Rechenzentrum in Frankfurt) kann Fermata zeitweise nicht erreichbar sein; Fristen, die in eine Störung fallen, verlängern wir [[Benn: so zusagen?]].

## § 15 Änderungen dieser Bedingungen

Wir können diese Bedingungen mit Wirkung für die Zukunft ändern, wenn ein sachlicher Grund besteht (zum Beispiel neue
Gesetze oder neue Funktionen). Wir informieren Sie mindestens [[6 Wochen]] vorher per E-Mail. Für eine laufende
Mitgliedschaft gelten wesentliche Änderungen (Preis, Leistung) nur mit Ihrer Zustimmung. [[Anwalt prüfen]]

## § 16 Verbraucherstreitbeilegung

[[Frage B14: „Wir sind nicht bereit und nicht verpflichtet, an Streitbeilegungsverfahren vor einer
Verbraucherschlichtungsstelle teilzunehmen.“ – oder Name der Stelle. Gleiche Aussage wie im Impressum.]]

## § 17 Schlussbestimmungen

1. Es gilt deutsches Recht. Zwingende Verbraucherschutzvorschriften des Staates, in dem Sie Ihren gewöhnlichen Aufenthalt haben, bleiben unberührt.
2. Vertragssprache ist Deutsch.
3. Sind einzelne Bestimmungen unwirksam, bleibt der Vertrag im Übrigen wirksam (§ 306 BGB).

*Entwurf vom 03.10.2026. Der verbindliche Text folgt nach rechtlicher Prüfung.*$md$),

-- Quelle: docs/recht/widerrufsbelehrung.md
('widerruf', '2026-10-03-entwurf', 'entwurf', 'Widerrufsbelehrung und Muster-Widerrufsformular',
$md$## Widerrufsbelehrung

### Widerrufsrecht

Sie haben das Recht, binnen vierzehn Tagen ohne Angabe von Gründen diesen Vertrag zu widerrufen.

Die Widerrufsfrist beträgt vierzehn Tage ab dem Tag des Vertragsabschlusses.

Um Ihr Widerrufsrecht auszuüben, müssen Sie uns

[[Name/Firma]], [[Straße und Hausnummer]], [[PLZ und Ort]], Telefon: [[…]], E-Mail: [[…]]

mittels einer eindeutigen Erklärung (zum Beispiel ein mit der Post versandter Brief oder eine E-Mail) über Ihren
Entschluss, diesen Vertrag zu widerrufen, informieren. Sie können dafür das unten stehende Muster-Widerrufsformular
verwenden, das jedoch nicht vorgeschrieben ist.

Sie können den Widerruf auch **in der App oder auf unserer Website über die Schaltfläche „Vertrag widerrufen“**
erklären: Dort geben Sie Ihren Namen, die Vertragsnummer und die E-Mail-Adresse für die Bestätigung an und klicken
dann auf **„Widerruf bestätigen“**. Wir bestätigen Ihnen den Eingang sofort per E-Mail mit Datum und Uhrzeit.

Zur Wahrung der Widerrufsfrist reicht es aus, dass Sie die Mitteilung über die Ausübung des Widerrufsrechts vor
Ablauf der Widerrufsfrist absenden.

### Folgen des Widerrufs

Wenn Sie diesen Vertrag widerrufen, haben wir Ihnen alle Zahlungen, die wir von Ihnen erhalten haben, unverzüglich
und spätestens binnen vierzehn Tagen ab dem Tag zurückzuzahlen, an dem die Mitteilung über Ihren Widerruf dieses
Vertrags bei uns eingegangen ist. Für diese Rückzahlung verwenden wir dasselbe Zahlungsmittel, das Sie bei der
ursprünglichen Transaktion eingesetzt haben, es sei denn, mit Ihnen wurde ausdrücklich etwas anderes vereinbart; in
keinem Fall werden Ihnen wegen dieser Rückzahlung Entgelte berechnet.

Haben Sie verlangt, dass die Dienstleistungen während der Widerrufsfrist beginnen sollen, so haben Sie uns einen
angemessenen Betrag zu zahlen, der dem Anteil der bis zu dem Zeitpunkt, zu dem Sie uns von der Ausübung des
Widerrufsrechts hinsichtlich dieses Vertrags unterrichten, bereits erbrachten Dienstleistungen im Vergleich zum
Gesamtumfang der im Vertrag vorgesehenen Dienstleistungen entspricht.

### Erläuterung zum Wertersatz bei Fermata (nicht Teil des gesetzlichen Musters)

[[Frage B13 – mit dem Anwalt bestätigen:]] Die im Vertrag vorgesehene Leistung sind die Abende eines Zeitraums von
4 Wochen. Als bereits erbracht gilt jeder Abend aus Ihrer Mitgliedschaft, der stattgefunden hat oder den Sie
kurzfristig abgesagt bzw. nicht wahrgenommen haben. Der Wertersatz beträgt daher je genutztem Abend:

- [[Auftakt]] – Preis je 4 Wochen: 49,00 € · Abende: 1 · Wertersatz je genutztem Abend: 49,00 €
- Andante – Preis je 4 Wochen: 149,00 € · Abende: 2 · Wertersatz je genutztem Abend: 74,50 €
- Loge – Preis je 4 Wochen: 299,00 € · Abende: 4 · Wertersatz je genutztem Abend: 74,75 €

Höchstens zahlen Sie den bereits gezahlten Betrag. Der kostenlose erste Abend und Gutschriften zählen nicht.
Den Rest erstatten wir über Stripe auf Ihr ursprüngliches Zahlungsmittel. Bevor Sie den Widerruf bestätigen, zeigt
Ihnen die App die Berechnung.

Wertersatz fällt nur an, weil Sie bei der Bestellung ausdrücklich verlangt haben, dass wir vor Ende der
Widerrufsfrist mit der Leistung beginnen. Den Wortlaut dieser Erklärung und den Zeitpunkt finden Sie in Ihrer
Bestellbestätigung.

### Was bei einem Widerruf in Fermata geschieht

- Ihre Mitgliedschaft endet sofort; noch nicht genutzte Abende aus der Mitgliedschaft verfallen.
- Bereits vereinbarte oder in Abstimmung befindliche Abende sagen wir ab. Ihr Gegenüber erhält eine neutrale Nachricht und seinen Abend zurück.
- Ihr Konto bleibt bestehen; Sie können es separat löschen.

*Ende der Widerrufsbelehrung.*

## Muster-Widerrufsformular

(Wenn Sie den Vertrag widerrufen wollen, dann füllen Sie bitte dieses Formular aus und senden Sie es zurück.)

- An [[Name/Firma]], [[Anschrift]], E-Mail: [[…]]:
- Hiermit widerrufe(n) ich/wir (∗) den von mir/uns (∗) abgeschlossenen Vertrag über die Erbringung der folgenden Dienstleistung (∗): Mitgliedschaft bei Fermata, Stufe [[…]], Vertragsnummer [[FM-…]]
- Bestellt am (∗)/erhalten am (∗)
- Name des/der Verbraucher(s)
- Anschrift des/der Verbraucher(s)
- Unterschrift des/der Verbraucher(s) (nur bei Mitteilung auf Papier)
- Datum

(∗) Unzutreffendes streichen.

*Entwurf vom 03.10.2026. Der verbindliche Text folgt nach rechtlicher Prüfung.*$md$),

-- Quelle: docs/recht/ki-hinweis.md
('ki_hinweis', '2026-10-03-entwurf', 'entwurf', 'Hinweis: künstliche Intelligenz',
$md$Bei Fermata arbeitet künstliche Intelligenz an drei Stellen mit (Art. 50 KI-Verordnung). Hier steht, wo, welche
Dienste beteiligt sind und was gespeichert wird.

## 1. Viola, die Stimme im Gespräch

- **Viola ist eine künstliche Intelligenz, kein Mensch.** Sie sagt das zu Beginn jedes Gesprächs, und die App zeigt es vor dem Verbinden an.
- Während Sie sprechen, wandelt die Spracherkennung **Deepgram** Ihre Stimme auf Servern in der EU in Text um. Ein Sprachmodell, **Claude von Anthropic**, betrieben über **Amazon Bedrock** in der EU, formuliert Violas Antworten. Eine künstliche Stimme, **Amazon Polly** in Frankfurt, spricht sie. [[Frage B4: Stimme nach dem Blindtest eintragen]]
- Amazon Bedrock verteilt die Anfragen über ein EU-Profil auf mehrere Rechenzentren. Dazu können auch Rechenzentren in London und Zürich gehören; für das Vereinigte Königreich und die Schweiz gibt es einen Angemessenheitsbeschluss der EU-Kommission. [[Bedrock-Weg festlegen: EU-Profil oder nur Frankfurt]]
- **Fermata zeichnet Ihre Stimme nicht auf.** Die Dienste verarbeiten sie nur, während Sie sprechen [[Aufbewahrung bei Deepgram und AWS in den Auftragsverarbeitungsverträgen bestätigen]]. Gespeichert wird nur der Text des Gesprächs, und zwar **30 Tage** lang; danach löschen wir ihn automatisch.

## 2. Die Auswertung nach dem Gespräch

- Dasselbe Sprachmodell liest den Gesprächstext und schlägt eine Zusammenfassung vor. Sie gilt erst, wenn Sie sie bestätigt oder korrigiert haben.
- Das Gespräch wird außerdem **automatisch** auf Hinweise zu einer Krise, auf Minderjährigkeit, Gewalt oder Belästigung geprüft. Bei einem Treffer erhält Fermata einen Hinweis ohne Zitat. Den Gesprächstext liest ein Mensch bei Fermata nur in einem solchen Sicherheitsfall; jede Einsicht wird mit Grund protokolliert.

## 3. Die Auswahl

- Ein Programm nutzt das Sprachmodell, um zu bewerten, wer zusammenpassen könnte, und um den kurzen Text „Warum Sie beide“ zu entwerfen. Es erhält dafür Ihre bestätigte Zusammenfassung ohne Namen und ohne Ihre Angaben zu Geschlecht, Orientierung und Religion.
- **Jeden Vorschlag prüft und gibt ein Mensch frei.** Ohne diese Freigabe erhält niemand einen Vorschlag.

## Besonders geschützte Angaben

- Ihre Angaben zu Geschlecht, gesuchtem Geschlecht, Orientierung und Religion aus dem Formular gehen nie an ein Sprachmodell. Die Auswahl erhält dazu nur „passt“ oder „passt nicht“.
- Viola fragt nicht nach Gesundheit, Religion, Herkunft, Sexualität oder anderen besonders geschützten Themen. Erzählen Sie davon von sich aus, verarbeiten Spracherkennung und Sprachmodell es **während des Gesprächs** wie alles andere Gesagte. **Vor dem Speichern filtern wir solche Sätze heraus:** Sie kommen nicht in den gespeicherten Text, nicht in die Zusammenfassung und nicht in Ihr Profil. Ausnahme: Sätze, die auf eine Gefahr hinweisen, bleiben im Text, damit wir helfen können; auch sie werden nach 30 Tagen gelöscht.

Die Anbieter dürfen Ihre Daten laut Vertrag nicht nutzen, um ihre Modelle zu trainieren [[in den
Auftragsverarbeitungsverträgen mit AWS und Deepgram bestätigen]]. Mehr dazu in der Datenschutzerklärung.

*Entwurf vom 03.10.2026. Der verbindliche Text folgt nach rechtlicher Prüfung.*$md$),

-- Quelle: docs/recht/einwilligungen.md
('art9_profile', '2026-10-03-m8-entwurf', 'entwurf', 'Einwilligung: Geschlecht und gesuchtes Geschlecht',
$md$Damit wir Ihnen ein passendes Gegenüber vorschlagen können, fragen wir nach Ihrem Geschlecht und danach, wen Sie
kennenlernen möchten. Freiwillig können Sie Ihre Orientierung angeben. Diese Angaben lassen Rückschlüsse auf Ihre
sexuelle Orientierung zu und sind deshalb besonders geschützt (Art. 9 DSGVO).

Ich willige ausdrücklich ein, dass Fermata diese Angaben verarbeitet, um

1. automatisch zu prüfen, ob eine andere Person und ich gegenseitig zu dem passen, was wir suchen (Ergebnis nur „passt“ oder „passt nicht“), und
2. in Summen zu zählen, wie viele Menschen je Geschlecht einen Vorschlag erhalten (Gruppen unter 5 Personen werden nicht ausgewiesen), um Benachteiligungen zu erkennen.

Die Angaben liegen verschlüsselt in Frankfurt am Main. Das Sprachmodell und Fermata-Mitarbeitende sehen sie nicht.
Ihr Gegenüber erfährt Ihre Angaben nicht. Aus einem Vorschlag kann es aber schließen, dass Sie Menschen wie ihn oder
sie kennenlernen möchten.

Ich kann diese Einwilligung jederzeit unter „Konto → Einwilligungen“ widerrufen. Dann löscht Fermata die Angaben
sofort; ohne sie sind keine Vorschläge möglich. (Art. 9 Abs. 2 lit. a, Art. 6 Abs. 1 lit. a DSGVO)

*Entwurf vom 03.10.2026. Der verbindliche Text folgt nach rechtlicher Prüfung.*$md$),

-- Quelle: docs/recht/einwilligungen.md
('art9_religion', '2026-10-03-m8-entwurf', 'entwurf', 'Einwilligung: Religion (freiwillig)',
$md$Wenn Ihnen Religion bei einem Gegenüber wichtig ist, können Sie Ihre Religion, ihre Bedeutung für Sie und den Wunsch
„nur jemand mit gleicher Religion“ angeben. Das ist ganz freiwillig. Religion ist besonders geschützt (Art. 9 DSGVO).

Ich willige ausdrücklich ein, dass Fermata diese Angaben verschlüsselt speichert und automatisch prüft, ob eine
andere Person und ich in diesem Punkt zusammenpassen. Die Prüfung wirkt nur, wenn eine von uns beiden „gleiche
Religion“ verlangt; das Ergebnis ist nur „passt“ oder „passt nicht“. Das Sprachmodell und Fermata-Mitarbeitende sehen
die Angaben nicht.

Ich kann die Einwilligung jederzeit widerrufen. Dann löscht Fermata die Angaben sofort. (Art. 9 Abs. 2 lit. a DSGVO)

*Entwurf vom 03.10.2026. Der verbindliche Text folgt nach rechtlicher Prüfung.*$md$),

-- Quelle: docs/recht/einwilligungen.md
('biometrie', '2026-10-03-m8-entwurf', 'entwurf', 'Einwilligung: Ausweisprüfung mit Gesichtsabgleich',
$md$Damit bei Fermata nur echte, volljährige Menschen teilnehmen, prüfen wir einmal Ihren Ausweis über den Dienst
Didit [[Firma, Sitz]]. Sie fotografieren Ihren Ausweis und nehmen ein kurzes Video Ihres Gesichts auf; Didit
vergleicht Ihr Gesicht mit dem Ausweisfoto.

Ich willige ausdrücklich ein, dass Didit dafür meine biometrischen Daten verarbeitet (Art. 9 Abs. 2 lit. a DSGVO).

- Fermata erhält und speichert nur: volljährig ja oder nein, mein Geburtsjahr, ob Name und Geburtsdatum mit meinen Angaben übereinstimmen, die Prüfnummer. Keine Bilder, keine Ausweisnummer.
- Aus Ausweisnummer und Geburtsdatum sowie aus Name und Geburtsdatum bildet Fermata nicht umkehrbare Prüfwerte, um ausgeschlossene Personen zu erkennen.
- Direkt nach dem Ergebnis lässt Fermata die Prüfung bei Didit löschen; spätestens nach einem Monat löscht Didit sie von selbst.
- Didit verarbeitet die Daten laut eigener Auskunft in der EU, hat seinen Sitz aber in den USA. Ein Zugriff von US-Behörden lässt sich nicht ganz ausschließen.

Ich kann die Einwilligung jederzeit widerrufen. Eine bereits abgeschlossene Prüfung bleibt gültig, weil Didit die
Daten dann schon gelöscht hat. Ohne Ausweisprüfung kann Fermata mir keine Abende vorschlagen.

*Entwurf vom 03.10.2026. Der verbindliche Text folgt nach rechtlicher Prüfung.*$md$),

-- Quelle: docs/recht/einwilligungen.md
('gespraech', '2026-10-03-m8-entwurf', 'entwurf', 'Einwilligung: Gespräch mit Viola',
$md$Viola ist eine künstliche Intelligenz, kein Mensch. Im Gespräch fragt sie nach Ihrer Persönlichkeit, Ihren Werten,
Wünschen an ein Gegenüber, Lebensumständen, Fahrbereitschaft und freien Zeiten. Sie können sprechen oder schreiben.

Ich willige ein, dass Fermata dafür

- meine Stimme **live** verarbeiten lässt: Spracherkennung durch Deepgram (Server in der EU), Antworten durch das Sprachmodell Claude von Anthropic über Amazon Bedrock in der EU (das EU-Profil kann auch Rechenzentren in London und Zürich nutzen; für beide Länder gibt es einen Angemessenheitsbeschluss der EU-Kommission), Stimme von Viola durch Amazon Polly in Frankfurt. **Fermata zeichnet meine Stimme nicht auf.**
- den **Text des Gesprächs 30 Tage** speichert und dann löscht,
- aus dem Gespräch mit demselben Sprachmodell eine **Zusammenfassung und ein Profil** erstellt, die ich bestätige oder korrigiere,
- das Gespräch **automatisch** auf Hinweise zu einer Krise, Minderjährigkeit, Gewalt oder Belästigung prüft und Fermata dann ohne Zitat benachrichtigt. Den Gesprächstext liest ein Mensch bei Fermata nur in einem solchen Sicherheitsfall; jede Einsicht wird mit Grund protokolliert.

Viola fragt nicht nach Gesundheit, Religion, Herkunft, Sexualität oder anderen besonders geschützten Themen.
**Erzähle ich davon von selbst, willige ich ausdrücklich ein (Art. 9 Abs. 2 lit. a DSGVO), dass dies während des
Gesprächs wie alles Gesagte verarbeitet wird.** Gespeichert wird es nicht: Fermata filtert solche Sätze vor dem
Speichern aus dem Gesprächstext, aus der Zusammenfassung und aus dem Profil. Ausnahme: Sätze, die auf eine Gefahr
hinweisen, bleiben im Text, damit Fermata helfen kann; auch sie werden nach 30 Tagen gelöscht.

Mein Gegenüber sieht aus dem Gespräch nur den kurzen Text „Warum Sie beide“, den ein Mensch vor dem Vorschlag prüft.
Den Gesprächstext und meine Zusammenfassung sieht es nie.

Ich kann das Gespräch jederzeit beenden und die Einwilligung jederzeit widerrufen. Dann löscht Fermata alle
gespeicherten Gesprächstexte sofort; ohne Gespräch sind keine neuen Vorschläge möglich. (Art. 6 Abs. 1 lit. a,
Art. 9 Abs. 2 lit. a DSGVO)

*Entwurf vom 03.10.2026. Der verbindliche Text folgt nach rechtlicher Prüfung.*$md$),

-- Quelle: docs/recht/einwilligungen.md
('push', '2026-10-03-m8-entwurf', 'entwurf', 'Einwilligung: Mitteilungen auf diesem Gerät',
$md$Wir erinnern Sie mit kurzen Mitteilungen an Fristen und Abende. Dafür speichern wir die Adresse, die Ihr Browser für
Mitteilungen erzeugt. Die Mitteilungen laufen verschlüsselt über den Dienst Ihres Geräte- oder Browserherstellers
(Apple, Google oder Mozilla, Sitz USA) und enthalten keine Namen. Zwischen 22 und 8 Uhr schicken wir keine
Mitteilungen außer zur Sicherheit. Wichtige Nachrichten kommen immer auch per E-Mail.

Sie können die Mitteilungen jederzeit abschalten oder die Einwilligung widerrufen; dann löschen wir alle gespeicherten
Adressen für Mitteilungen sofort. (Art. 6 Abs. 1 lit. a DSGVO, § 25 Abs. 1 TDDDG)

*Entwurf vom 03.10.2026. Der verbindliche Text folgt nach rechtlicher Prüfung.*$md$),

-- Quelle: docs/recht/einwilligungen.md
('kontakttausch', '2026-10-03-m8-entwurf', 'entwurf', 'Einwilligung: Kontakt teilen',
$md$Wenn Sie und Ihr Gegenüber nach einem Abend beide „Ja“ sagen, können Sie Kontaktdaten teilen. Für jeden Abend
entscheiden Sie neu und wählen, was Ihr Gegenüber erhält: E-Mail-Adresse, Telefonnummer oder beides. Die Daten
erscheinen nur in der App, nie in einer E-Mail. Ohne beidseitiges „Ja“ geben wir nichts weiter, und ein „Nein“ sieht
niemand.

Sie können die Einwilligung jederzeit widerrufen. Dann ziehen wir alle Freigaben zurück, die noch auf das „Ja“ Ihres
Gegenübers warten, und die App zeigt Ihre Kontaktdaten niemandem mehr an. **Was Ihr Gegenüber bereits erhalten hat,
können wir nicht zurückholen** – es kann sich die Daten schon notiert haben. (Art. 6 Abs. 1 lit. a DSGVO)

*Entwurf vom 03.10.2026. Der verbindliche Text folgt nach rechtlicher Prüfung.*$md$),

-- Quelle: docs/recht/einwilligungen.md
('datenschutz_kenntnis', '2026-10-03-m8-entwurf', 'entwurf', 'Datenschutzhinweise',
$md$Hier steht kurz, was mit Ihren Daten geschieht. Die vollständige Datenschutzerklärung finden Sie jederzeit unter
„Rechtliches“.

## Was wir speichern

- **Konto:** E-Mail-Adresse, Vor- und Nachname, Geburtsdatum, Postleitzahl und Ort, freiwillig eine Telefonnummer.
- **Ort für die Auswahl:** nur der Mittelpunkt Ihrer Postleitzahl, nie Ihre genaue Anschrift.
- **Ausweisprüfung:** über den Dienst Didit. Wir speichern nur, ob Sie volljährig sind, Ihr Geburtsjahr und ob Name und Geburtsdatum übereinstimmen. Keine Bilder, keine Ausweisnummer.
- **Gespräch mit Viola:** Viola ist eine künstliche Intelligenz. Ihre Stimme wird nicht aufgezeichnet; der Text des Gesprächs wird nach 30 Tagen gelöscht. Einzelheiten stehen in der Einwilligung „Gespräch mit Viola“ und im Hinweis zur künstlichen Intelligenz.
- **Auswahl:** Ein Programm mit einem Sprachmodell bewertet, wer zusammenpassen könnte. Jeden Vorschlag prüft ein Mensch.
- **Einwilligungen:** jede Erteilung und jeder Widerruf mit Datum und Fassung des Textes.

## Wo die Daten liegen

Die Datenbank liegt in Frankfurt am Main (EU). Einige Dienste haben ihren Sitz in den USA. Das Sprachmodell kann
über ein EU-Profil auch in London oder Zürich rechnen; für beide Länder gibt es einen Angemessenheitsbeschluss der
EU-Kommission. Es gibt keine Werbung und keine Analyse-Werkzeuge. In Ihrem Browser speichern wir nur, was die App
braucht: das Anmelde-Cookie, Ihr Farbschema und, wenn Sie es wünschen, ein Abo für Mitteilungen.

## Ihre Rechte

Sie können Ihre Daten jederzeit als Datei herunterladen, Einwilligungen widerrufen und Ihr Konto löschen. Fragen
beantwortet unsere Datenschutzstelle [[Kontakt]].

*Entwurf vom 03.10.2026. Der verbindliche Text folgt nach rechtlicher Prüfung.*$md$)
;

-- Einfügen. Gibt es unter derselben Fassung schon einen anderen Text (M2: Kurzfassung der AGB, fehlerhafter
-- KI-Hinweis), bekommt der alte Text die Fassung „<datum>-m2“ und den Status abgeloest – aber nur, solange niemand
-- ihm zugestimmt hat. Sonst erhält der neue Text eine eigene Fassung (…-2), damit Nachweise stimmen.
do $$
declare
  r record;
  v_version text;
  v_old ops.legal_documents;
  n integer;
begin
  for r in select * from new_legal_documents loop
    v_version := r.version;
    select * into v_old from ops.legal_documents d where d.kind = r.kind and d.version = r.version;
    if found and v_old.body_markdown is distinct from r.body_markdown then
      if exists (select 1 from app.consents c where c.kind = r.kind and c.document_version = r.version) then
        n := 2;
        while exists (select 1 from ops.legal_documents d where d.kind = r.kind and d.version = r.version || '-' || n) loop
          n := n + 1;
        end loop;
        v_version := r.version || '-' || n;
      else
        update ops.legal_documents d
           set version = replace(d.version, '-entwurf', '') || '-m2', status = 'abgeloest'
         where d.id = v_old.id;
      end if;
    end if;
    insert into ops.legal_documents (kind, version, status, title, body_markdown)
    values (r.kind, v_version, coalesce(r.status, 'entwurf'), r.title, r.body_markdown)
    on conflict (kind, version) do nothing;
    -- Je Art nur eine aktuelle Fassung.
    update ops.legal_documents d set status = 'abgeloest'
     where d.kind = r.kind and d.version <> v_version and d.status <> 'abgeloest';
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- 4. Gesundheit wird in Phase 1 nicht angeboten (siehe 20261003000906_consents_phase1.sql)
-- ---------------------------------------------------------------------------
update ops.legal_documents set status = 'abgeloest' where kind = 'art9_health' and status <> 'abgeloest';
