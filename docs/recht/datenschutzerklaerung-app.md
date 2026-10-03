# Datenschutzerklärung für die Web-App und das Gespräch mit Viola

> **ENTWURF – nicht rechtsverbindlich, Prüfung durch Anwalt/Datenschutzbeauftragten ausstehend.**
> Stand: 03.10.2026 · Fassung `datenschutz-app-2026-10-03-entwurf` · Grundlage: Code der Meilensteine M1–M7
> (Datenkarte: [`docs/DATA.md`](../DATA.md)). Platzhalter stehen in `[[doppelten eckigen Klammern]]`.
> Diese Erklärung gilt für Mitglieder (Web-App, Gespräch, Abende, Mitgliedschaft). Für die Landingpage gilt
> [datenschutzerklaerung-landing.md](datenschutzerklaerung-landing.md).

---

## 1. Wer verantwortlich ist

[[Vor- und Nachname oder Firma]]
[[Straße und Hausnummer]], [[PLZ und Ort]]
E-Mail: [[datenschutz@… (Frage A7)]] · Telefon: [[… (Frage A7)]]

**Datenschutzbeauftragte Person:** [[Name, Anschrift, E-Mail des externen Datenschutzbeauftragten (Frage B15)]]

## 2. Das Wichtigste in Kürze

- Fermata verabredet Abende zwischen zwei Menschen in Partner-Lokalen. Dafür brauchen wir Angaben über Sie, auch
  besonders geschützte (zum Beispiel, wen Sie kennenlernen möchten).
- Alle Daten liegen in einer Datenbank in **Frankfurt am Main**. Wir verkaufen keine Daten, zeigen keine Werbung und
  nutzen keine Analyse- oder Werbe-Cookies.
- **Viola ist eine künstliche Intelligenz**, kein Mensch. Ihre Stimme wird nicht aufgezeichnet. Der Text des
  Gesprächs wird nach **30 Tagen** gelöscht.
- Vorschläge für einen Abend berechnet ein Programm mit Hilfe eines Sprachmodells. **Jeden Vorschlag prüft und
  gibt ein Mensch frei.** Besonders geschützte Angaben (Geschlecht, Orientierung, Religion, Gesundheit) sieht das
  Sprachmodell der Auswahl nie.
- Ihr Gegenüber erfährt nur Ihren Vornamen, den kurzen Text „Warum Sie beide“, am Abend Ihr freiwilliges
  Erkennungszeichen und – nur wenn Sie beide „Ja“ sagen – die Kontaktdaten, die Sie freigeben.
- Sie können Ihre Daten jederzeit herunterladen, Einwilligungen einzeln widerrufen und Ihr Konto löschen
  (in der App unter „Konto“).

## 3. Aufruf der Web-App, Cookies und Speicher im Browser

**Auslieferung:** Die Web-App wird von Vercel Inc. ausgeliefert; die Server-Funktionen laufen in Frankfurt
(Region `fra1`). Beim Aufruf verarbeitet Vercel technisch
notwendige Daten (IP-Adresse, Zeitpunkt, Adresse der Seite, Browser-Kennung), um die Seite auszuliefern und vor
Missbrauch zu schützen. Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO. Speicherdauer der Protokolle bei Vercel:
[[laut Vercel-Vertrag eintragen]].

**Speicher in Ihrem Browser (§ 25 TDDDG):**

| Was | Wozu | Grundlage | Dauer |
|---|---|---|---|
| Anmelde-Cookie von Supabase (Sitzung) | hält Sie angemeldet | unbedingt erforderlich (§ 25 Abs. 2 Nr. 2 TDDDG), Art. 6 Abs. 1 lit. b DSGVO | bis zur Abmeldung bzw. Ablauf der Sitzung |
| Farbschema (hell/dunkel) im Local Storage | merkt sich Ihre Wahl auf diesem Gerät | auf Ihren Wunsch, § 25 Abs. 2 Nr. 2 TDDDG [[Anwalt prüfen]] | bis Sie es ändern oder den Browser-Speicher löschen |
| Service Worker und Zwischenspeicher | App funktioniert auch bei schlechter Verbindung, Empfang von Mitteilungen | unbedingt erforderlich bzw. Einwilligung „Mitteilungen“ | bis zur Deinstallation |
| Push-Abo | Mitteilungen auf diesem Gerät | Ihre Einwilligung (§ 25 Abs. 1 TDDDG, Art. 6 Abs. 1 lit. a DSGVO) | bis Sie es abschalten |

Die Web-App lädt keine Schriften, Skripte oder Bilder von fremden Servern. Ausnahmen, die Sie selbst auslösen: die
Bezahlseite von Stripe (Abschnitt 13), die Ausweisprüfung bei Didit (Abschnitt 8) und die Sprachverbindung zu Viola
(Abschnitt 9).

## 4. Einladung, Konto und Anmeldung

Sie erhalten eine persönliche Einladung. Dafür legen wir mit Ihrer E-Mail-Adresse ein Konto an. Wenn Sie über die
Warteliste kamen, übernehmen wir Ihren Gründungsstatus und vermerken die Einladung auf der Warteliste.

- **Daten:** E-Mail-Adresse, Zeitpunkte von Einladung und Anmeldungen, Anrede (Sie oder Du), Kontostatus.
- **Anmeldung:** mit einem 6-stelligen Code oder Link per E-Mail. Die E-Mails verschickt Brevo (Abschnitt 12).
  Beim Anmelden speichert unser Anmeldedienst (Supabase Auth) Sitzungsdaten, laut Supabase auch IP-Adresse und
  Browser-Kennung [[prüfen]].
- **Zweck und Grundlage:** Durchführung des Nutzungsvertrags (Art. 6 Abs. 1 lit. b DSGVO); Schutz des Kontos
  (Art. 6 Abs. 1 lit. f DSGVO).
- **Dauer:** bis zur Löschung Ihres Kontos. Nehmen Sie eine Einladung nicht innerhalb von 7 Tagen an, löschen wir das
  vorbereitete Konto automatisch.

## 5. Einwilligungen und deren Nachweis

Bevor Sie Angaben machen, fragen wir einzelne Einwilligungen ab. Jede Erteilung und jeden Widerruf speichern wir
mit Zeitpunkt und Fassung des Textes. So können wir nachweisen, wozu Sie eingewilligt haben (Art. 7 Abs. 1 DSGVO,
Art. 6 Abs. 1 lit. c DSGVO). Die Texte der Einwilligungen finden Sie in der App unter „Rechtliches“.

Sie können jede Einwilligung einzeln in der App unter „Konto → Einwilligungen“ widerrufen. Der Widerruf gilt für die
Zukunft. Was dann geschieht, steht bei der jeweiligen Verarbeitung.

## 6. Ihre Angaben im Formular

- **Daten:** Vor- und Nachname, Geburtsdatum, Postleitzahl, Ort, freiwillig Telefonnummer. Die Straße fragen wir
  nicht ab [[Frage B1: so lassen]].
- **Zweck:** Abgleich mit Ihrem Ausweis, Altersprüfung (ab 18), Kontakttausch (nur Telefon, nur wenn Sie es wollen).
  Für die Auswahl nutzen wir **nur den Mittelpunkt Ihrer Postleitzahl**, nie Ihre Anschrift. Die PLZ-Mittelpunkte
  liegen in unserer Datenbank; es wird kein externer Kartendienst gefragt. Quelle: Postleitzahlen: GeoNames
  (geonames.org), Lizenz CC BY 4.0, aufbereitet von zauberware/postal-codes-json-xml-csv.
- **Grundlage:** Art. 6 Abs. 1 lit. b DSGVO.
- **Nach der Ausweisprüfung** lassen sich Name und Geburtsdatum nicht mehr ändern (sonst wäre die Prüfung wertlos).
  Bei Fehlern wenden Sie sich an uns.
- **Dauer:** bis zur Löschung Ihres Kontos.

## 7. Besonders geschützte Angaben (Art. 9 DSGVO)

### 7.1 Geschlecht, gesuchtes Geschlecht, Orientierung

Damit wir Ihnen ein passendes Gegenüber vorschlagen können, fragen wir nach Ihrem Geschlecht und danach, wen Sie
kennenlernen möchten; freiwillig nach Ihrer Orientierung. Diese Angaben lassen Rückschlüsse auf Ihre sexuelle
Orientierung zu (EuGH, Urteil vom 01.08.2022, C-184/20) und sind deshalb besonders geschützt.

- **Grundlage:** Ihre ausdrückliche Einwilligung „Geschlecht und gesuchtes Geschlecht“ (Art. 9 Abs. 2 lit. a,
  Art. 6 Abs. 1 lit. a DSGVO). Wir fragen sie **vor** dem Formular.
- **Schutz:** Die Angaben liegen verschlüsselt (AES-256) in einem eigenen Bereich der Datenbank. Der Schlüssel liegt
  getrennt in einem Schlüsseltresor. Das Auswahlprogramm sieht die Angaben nie; es erhält nur die Antwort „passt“
  oder „passt nicht“. Das Sprachmodell erhält sie nie. Auch Fermata-Mitarbeitende sehen sie in der Verwaltung nicht.
- **Statistik zur Fairness:** Nach jedem Auswahl-Lauf zählen wir, wie viele Menschen je Geschlecht und je
  Altersgruppe einen Vorschlag bekamen – nur als Summen, nie gekreuzt, Gruppen unter 5 Personen werden unterdrückt.
  So erkennen wir, ob die Auswahl Gruppen benachteiligt. [[Anwalt: Zweck „Fairness-Prüfung“ in den
  Einwilligungstext aufnehmen oder auf Art. 9 Abs. 2 lit. a in Verbindung mit dieser Erklärung stützen]]
- **Widerruf:** Wir löschen die Angaben sofort. Ohne sie können wir Ihnen keine Abende vorschlagen.

### 7.2 Religion (freiwillig)

Wenn Ihnen Religion bei einem Gegenüber wichtig ist, können Sie Ihre Religion, deren Bedeutung für Sie und den
Wunsch „gleiche Religion“ angeben. Grundlage: ausdrückliche Einwilligung (Art. 9 Abs. 2 lit. a DSGVO). Schutz wie in
7.1; die Auswahl erhält nur „passt“ oder „passt nicht“, und nur dann, wenn eine der beiden Personen gleiche Religion
verlangt. Widerruf: sofortige Löschung.

### 7.3 Gesundheit (freiwillig)

[[Derzeit gibt es in der App keine Eingabe für Gesundheitsangaben (siehe Offene Punkte). Abschnitt streichen oder
nach Entscheidung ausfüllen.]]

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

- **Ablauf:** Sie fotografieren Ihren Ausweis und nehmen ein kurzes Video Ihres Gesichts auf. Didit vergleicht Ihr
  Gesicht mit dem Ausweisfoto (biometrische Daten, Art. 9 DSGVO) und liest Name, Geburtsdatum und Ausweisnummer aus.
- **Was wir erhalten und speichern:** volljährig ja oder nein, Ihr Geburtsjahr, ob Name und Geburtsdatum mit Ihren
  Angaben übereinstimmen, die Prüfnummer und den Zeitpunkt. **Keine Bilder, keine Ausweisnummer, keinen Namen aus
  dem Ausweis.**
- **Sperrlisten-Prüfwerte:** Aus Ausweisnummer und Geburtsdatum sowie aus Name und Geburtsdatum bilden wir
  Prüfwerte (HMAC-SHA256 mit geheimem Schlüssel), die sich nicht zurückrechnen lassen. Wir vergleichen sie mit
  unserer Sperrliste ausgeschlossener Personen und speichern sie, damit ein späterer Ausschluss auch bei einem neuen
  Konto wirkt (Abschnitt 14).
- **Löschung bei Didit:** Direkt nach dem Ergebnis beauftragen wir Didit, die Prüfung zu löschen; zusätzlich ist bei
  Didit die kürzeste Aufbewahrung (1 Monat) eingestellt [[nach Einrichtung bestätigen]].
- **Grundlage:** biometrischer Abgleich: Ihre ausdrückliche Einwilligung „Ausweisprüfung“ (Art. 9 Abs. 2 lit. a
  DSGVO); Ergebnis und Prüfwerte: Vertrag (Art. 6 Abs. 1 lit. b) und Schutz aller Mitglieder (Art. 6 Abs. 1 lit. f).
- **Drittland:** Didit verarbeitet laut eigener Auskunft in der EU, hat seinen Sitz aber in den USA. Ein Zugriff
  von US-Behörden lässt sich deshalb nicht ausschließen. [[Grundlage der Übermittlung: Data Privacy Framework oder
  Standardvertragsklauseln eintragen]]
- **Ohne Biometrie:** [[Frage B2: Alternative, z. B. persönliche Prüfung; bis dahin: „Ohne Ausweisprüfung können
  wir Ihnen keine Abende vorschlagen.“]]
- **Dauer bei uns:** Ergebnis und Prüfwerte bis zur Löschung Ihres Kontos.

## 9. Das Gespräch mit Viola

Viola ist eine **Stimme mit künstlicher Intelligenz**, ohne Gesicht. Sie sagt das zu Beginn jedes Gesprächs, und
die App zeigt es vor dem Verbinden an (Art. 50 KI-Verordnung, siehe [ki-hinweis.md](ki-hinweis.md)). Viola fragt nach
Persönlichkeit, Werten, Wünschen an ein Gegenüber, Lebensumständen, Fahrbereitschaft und freien Zeiten. Sie können
statt zu sprechen auch schreiben.

**Ablauf der Daten im Gespräch:**

1. Ihre Stimme geht über eine verschlüsselte Sprachverbindung (LiveKit [[Weg A, B oder C, Frage B3]]) zu Viola. Viola
   läuft auf Servern von Amazon Web Services in Frankfurt.
2. Die Spracherkennung **Deepgram** (EU-Server) macht daraus Text. Stille wird nicht übertragen. Deepgram nutzt die
   Daten laut Vertrag nicht zur Verbesserung eigener Modelle (Einstellung `mip_opt_out`).
3. Das Sprachmodell **Claude Sonnet 5.5** (Anthropic) über **Amazon Bedrock** in der EU formuliert Violas Antwort.
   [[EU-Geo-Profil: Anfragen können auf Rechenzentren in der EU sowie in London und Zürich verteilt werden;
   Vereinigtes Königreich und Schweiz haben einen Angemessenheitsbeschluss der EU-Kommission. Oder: regional nur
   Frankfurt – je nach Entscheidung.]] Amazon speichert die Anfragen laut Vertrag nicht und nutzt sie nicht zum
   Training [[im AV-Vertrag bestätigen]].
4. Die Stimme von Viola erzeugt **Amazon Polly** in Frankfurt [[Frage B4: Ergebnis des Blindtests eintragen]].

**Was gespeichert wird:**

| Was | Wo | Wie lange |
|---|---|---|
| Ihre Stimme (Audio) | **nirgends** | – |
| Text des Gesprächs (Ihre und Violas Beiträge), geschützte Angaben ersetzt | Datenbank Frankfurt | **30 Tage**, dann automatisch gelöscht; bei Widerruf der Einwilligung sofort |
| Ablauf des Gesprächs (Art, Dauer, Zeitpunkt des KI-Hinweises, Ende-Grund) | Datenbank | bis zur Löschung Ihres Kontos |
| Entwurf und bestätigte Zusammenfassung, daraus abgeleitetes Profil (Persönlichkeit, Werte, Wünsche, Ausschlüsse, Lebensumstände, Fahrbereitschaft) | Datenbank | bis zur Löschung Ihres Kontos; Sie können die Zusammenfassung jederzeit korrigieren |
| Kosten und Antwortzeiten des Gesprächs (ohne Inhalte) | Datenbank | dauerhaft, nach Löschung Ihres Kontos ohne Bezug zu Ihnen |
| Hinweis auf eine mögliche Gefahr (Art des Hinweises, keine Zitate) | Datenbank, nur für die Sicherheitsprüfung | siehe Abschnitt 14 |

**Auswertung:** Nach dem Gespräch wertet ein zweiter Durchgang desselben Sprachmodells den Gesprächstext aus und
schlägt eine Zusammenfassung vor. **Sie lesen sie und bestätigen, korrigieren oder verwerfen sie.** Erst die
bestätigte Fassung nutzen wir für die Auswahl.

**Sicherheit im Gespräch:** Erkennt Viola Hinweise auf eine Krise, auf Minderjährigkeit, Gewalt oder Belästigung,
nennt sie Hilfsangebote, beendet das Gespräch, wenn nötig, und hinterlässt uns einen Hinweis ohne Freitext.

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

1. **Feste Regeln:** Entfernung (Luftlinie zwischen den PLZ-Mittelpunkten, höchstens Ihre Fahrbereitschaft),
   Altersbereich, gemeinsame Sprache, Ihre Ausschlüsse (zum Beispiel Rauchen), nicht blockiert, gemeinsame freie Zeit,
   ein Lokal mit freiem Tisch, Geschlecht und gegebenenfalls Religion (nur „passt / passt nicht“).
2. **Teilwerte** nach festen Formeln für Werte, Wünsche, Persönlichkeit, Lebensumstände und gemeinsame Zeiten.
3. **Sprachmodell:** Für die aussichtsreichsten Paare bewertet Claude Sonnet 5.5 nach einer festen Rubrik, ob die
   beiden zusammenpassen könnten, und schreibt einen Entwurf „Warum Sie beide“. Es erhält dafür je Person Alter,
   bestätigte Zusammenfassung (ohne Namen, Geschlechtshinweise neutralisiert), Werte, Wünsche, Lebensumstände,
   Rauchen, Kinder, Kinderwunsch, Sprachen, auf 5 km gerundete Entfernung. **Nie:** Namen, Anschrift, PLZ,
   Geschlecht, Orientierung, Religion, Gesundheit.
4. **Zuordnung:** Eine Rechnung bildet möglichst viele Paare mit möglichst hoher Gesamtbewertung; wer lange gewartet
   hat, bekommt einen kleinen Vorrang.
5. **Prüfung:** Ein zweiter Durchgang des Sprachmodells und ein fester Wortfilter prüfen den Text „Warum Sie beide“
   auf geschützte Inhalte; bei einem Treffer wird ein neutraler Text verwendet.
6. **Menschliche Entscheidung:** Benn [[Name/Funktion]] sieht jeden Vorschlag mit Bewertung, Begründung und
   Hinweisen und **gibt ihn frei oder lehnt ihn ab**. Erst mit der Freigabe erhalten Sie einen Vorschlag.

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
**Dauer:** Teilwerte der Bewertung 12 Monate; Bericht je Lauf (Summen, keine Einzelpersonen) dauerhaft; Ihr
Vorschlag bis zur Löschung Ihres Kontos oder des Kontos Ihres Gegenübers.

## 11. Abende

| Schritt | Welche Daten | Wer sieht was |
|---|---|---|
| Zeitenabfrage | Ihre freien Zeitfenster je Zeitraum | nur Sie und die Auswahl |
| Vorschlag und Terminabstimmung | Lokal, Uhrzeiten, Ihre Wunschzeiten, Fristen | Sie beide; Ihr Gegenüber sieht Ihren **Vornamen** und den Text „Warum Sie beide“ |
| Reservierung | Datum, Uhrzeit, Name „Fermata“, 4-stelliger Tisch-Code, 2 Personen | das Lokal – **nie Ihr Name oder Ihre Kontaktdaten** |
| Finde-Fenster (15 Minuten vor bis 45 Minuten nach Beginn) | Tisch-Code, Vorname, freiwilliges Erkennungszeichen (z. B. „dunkelblauer Schal“) | Ihr Gegenüber, nur in diesem Zeitfenster; das Erkennungszeichen löschen wir danach |
| Check-in 30 Minuten nach Beginn | „alles gut“, „unsicher“ oder „Hilfe“ | Fermata; bei „Hilfe“ sofortige Nachricht an [[Benn/Sicherheitskontakt]] |
| Abend teilen | ein Link für eine Vertrauensperson mit Lokal, Adresse, Uhrzeit, Ihrem Vornamen | die Person, der Sie den Link geben; nichts über Ihr Gegenüber; ungültig 24 Stunden nach Beginn oder wenn Sie ihn zurückziehen |
| Rückmeldung am nächsten Tag | war ich da, war das Gegenüber da, sicher gefühlt, Bewertungen, Notiz, Kontakt ja/nein | Fermata; **nie Ihr Gegenüber** |
| Kontakttausch | E-Mail und/oder Telefon, nur wenn Sie **beide** „Ja“ sagen | Ihr Gegenüber, nur in der App, nie per E-Mail; ein „Nein“ sieht niemand |
| Blockieren | wer wen blockiert | niemand außer Ihnen und der Auswahl |

**Grundlage:** Vertrag (Art. 6 Abs. 1 lit. b); Check-in und Hilfe: Art. 6 Abs. 1 lit. d und f; Kontakttausch: Ihre
Einwilligung „Kontakt teilen“ (Art. 6 Abs. 1 lit. a), die Sie für jeden Abend durch Ihr „Ja“ bestätigen.
**Dauer:** bis zur Löschung Ihres Kontos. Löscht Ihr Gegenüber sein Konto, entfällt auch der gemeinsame Abend samt
Rückmeldungen [[Benn/Anwalt: so lassen?]].

**Partner-Lokale** erhalten von uns keine Daten über Sie außer der Reservierung oben. Was Sie im Lokal bestellen und
bezahlen, regelt das Lokal selbst.

## 12. Nachrichten per E-Mail und Mitteilung

- **E-Mail:** Anmeldecodes, Bestätigungen, Fristen, Erinnerungen, Sicherheitsnachrichten und Eingangsbestätigungen
  verschickt **Brevo** (Sendinblue SAS, Paris, Frankreich). Öffnungs- und Klickverfolgung sind ausgeschaltet. Mails
  nennen Ihr Gegenüber nicht beim Namen.
- **Mitteilungen (Web-Push):** nur mit Ihrer Einwilligung „Mitteilungen“. Sie laufen über den Dienst Ihres
  Browser- oder Geräteherstellers (Apple, Google oder Mozilla, Sitz USA). Der Inhalt ist Ende-zu-Ende verschlüsselt;
  der Dienst sieht nur die Adresse Ihres Abos und den Zeitpunkt. Die Texte sind kurz und enthalten keine Namen.
  Zwischen 22 und 8 Uhr schicken wir keine Mitteilungen außer zur Sicherheit.
- **Protokoll:** Wir speichern, welche Nachricht wann über welchen Weg verschickt wurde – ohne Inhalt und ohne
  Adresse. [[Dauer festlegen, Vorschlag 12 Monate]]
- **Grundlage:** Vertrag (Art. 6 Abs. 1 lit. b); Mitteilungen: Einwilligung (Art. 6 Abs. 1 lit. a, § 25 Abs. 1
  TDDDG). Widerruf: Wir löschen Ihre Push-Abos sofort.

## 13. Mitgliedschaft und Zahlung

Bis einschließlich zu Ihrem ersten Abend ist Fermata kostenlos, ohne Zahlungsdaten. Danach können Sie eine
Mitgliedschaft abschließen.

- **Bei uns:** Stufe, Status, Vertragsnummer, Zeiträume, Kontingent an Abenden, Bestellung (die angezeigte Übersicht
  und der Knopftext), Kündigung und Widerruf mit Zeitpunkt, Name und Kontakt-E-Mail, Eingangsbestätigungen;
  Kennungen von Kunde, Abo und Rechnung bei Stripe.
- **Bei Stripe** (Stripe Payments Europe Ltd., Dublin, Irland): Ihre Zahlungsdaten geben Sie direkt bei Stripe ein;
  sie erreichen Fermata nie. Stripe erhält von uns Ihre E-Mail-Adresse und eine interne Kennung. Nachrichten von
  Stripe an uns speichern wir ohne Karten-, Adress-, Telefon- und Namensangaben. Stripe verarbeitet Daten teilweise
  in eigener Verantwortung (zum Beispiel zur Betrugsvorbeugung) und kann Daten an Stripe, Inc. (USA) übermitteln
  [[Grundlage und Datenschutzhinweise von Stripe verlinken]].
- **Grundlage:** Vertrag (Art. 6 Abs. 1 lit. b); Aufbewahrung von Vertrags- und Buchungsunterlagen: gesetzliche
  Pflicht (Art. 6 Abs. 1 lit. c i. V. m. § 257 HGB, § 147 AO).
- **Dauer:** bis zur Löschung Ihres Kontos; Unterlagen zu Bestellung, Kündigung und Widerruf
  [[6 Jahre für Geschäftsbriefe, 8 Jahre für Buchungsbelege – Steuerberatung bestätigen]] auch danach, ohne Verknüpfung mit Ihrem Konto.

## 14. Sicherheit: Meldungen, Sperren, Sperrliste

- **Meldungen:** Sie können überall in der App etwas melden. Wir speichern, wer was zu wem meldet, die Schilderung
  und unsere Entscheidung. **Die gemeldete Person erfährt nie, wer gemeldet hat.** Wir prüfen Meldungen in der Regel
  innerhalb von 24 Stunden.
- **Vorläufige Sperre:** Bei schweren Vorwürfen (Übergriff, Bedrohung, Verdacht auf Minderjährigkeit) sperren wir das
  gemeldete Konto sofort vorläufig, sagen offene Abende ohne Angabe von Gründen ab und prüfen dann. Die betroffene
  Person kann widersprechen.
- **Sperrliste:** Wer ausgeschlossen wird, kommt auf eine Sperrliste, die **nur Prüfwerte** enthält (siehe
  Abschnitt 8). Ein Treffer mit dem Prüfwert aus der Ausweisnummer sperrt ein neues Konto automatisch; ein Treffer
  nur beim Namen führt zu einer Prüfung durch einen Menschen. Die Sperrliste bewahren wir dauerhaft auf, solange der
  Ausschluss gilt [[Anwalt: Dauer begründen, siehe DSFA]].
- **Weitergabe an die Polizei:** Nur wenn Fermata nach Rücksprache mit der betroffenen Person Anzeige erstattet.
  Dann geben wir die nötigen Angaben (Sachverhalt, Name, Geburtsdatum, Wohnort der beschuldigten Person) an die
  Polizei weiter. Grundlage: Art. 6 Abs. 1 lit. f DSGVO, § 24 Abs. 1 Nr. 1 BDSG [[Anwalt prüfen, auch Art. 10 DSGVO]].
- **Grundlage:** Schutz aller Mitglieder (Art. 6 Abs. 1 lit. f), Nutzungsbedingungen (lit. b); bei Gefahr für Leib
  und Leben lit. d. Meldungen können besonders geschützte Angaben oder Angaben zu Straftaten enthalten
  [[Anwalt: Art. 9 Abs. 2 lit. f, Art. 10 DSGVO]].
- **Dauer:** [[Vorschlag aus dem Löschkonzept: Meldungen 3 Jahre nach Abschluss; Sperren bis zum Ende bzw. zur
  Kontolöschung; Sperrliste solange der Ausschluss gilt]].

## 15. Verwaltung, Protokolle, Sicherungen

- Verwaltungsaufgaben erledigt nur [[Benn]] mit Zwei-Faktor-Anmeldung. Jede Freigabe, jede Einsicht in eine Meldung
  oder ein Konto und jede Änderung von Einstellungen protokollieren wir (Handlung, Zeit, handelnde Person).
  Grundlage: Art. 6 Abs. 1 lit. c und f i. V. m. Art. 5 Abs. 2, Art. 32 DSGVO. Dauer: [[festlegen]].
- Server-Protokolle (Supabase, Vercel, Amazon Web Services) enthalten technische Daten wie IP-Adressen. Dauer:
  [[laut Verträgen eintragen]].
- Die Datenbank wird regelmäßig gesichert [[Tarif, Dauer]]. Gelöschte Daten verschwinden aus den Sicherungen mit
  deren Ablauf.

## 16. Empfänger und Auftragsverarbeiter

| Empfänger | Aufgabe | Ort |
|---|---|---|
| Supabase [[Vertragspartner]] | Datenbank, Anmeldung, Server-Funktionen | Frankfurt am Main (AWS) |
| Vercel Inc. | Auslieferung der Web-App | Funktionen Frankfurt, Auslieferung weltweit; Sitz USA |
| Sendinblue SAS (Brevo) | E-Mail-Versand | Frankreich |
| Amazon Web Services EMEA SARL | Viola, Auswahl-Programm, Sprachmodell (Bedrock), Stimme (Polly), Protokolle | Frankfurt; EU-Geo-Profil siehe Abschnitt 9 |
| Deepgram [[Vertragspartner]] | Spracherkennung | EU-Server; Sitz USA |
| LiveKit [[nur bei Weg A/B]] | Sprachverbindung | [[EU-Region]]; Sitz USA |
| Didit [[Vertragspartner]] | Ausweisprüfung | EU laut Didit; Sitz USA |
| Stripe Payments Europe Ltd. | Zahlung | Irland; teils eigene Verantwortung |
| Apple, Google, Mozilla | Zustellung verschlüsselter Mitteilungen | USA |
| Partner-Lokale | Reservierung ohne Namen | Westmecklenburg |
| Polizei | nur bei Anzeige (Abschnitt 14) | Deutschland |

Einzelheiten und Vertragsstand: [av-liste.md](av-liste.md).

## 17. Übermittlung in Drittländer

Wir wählen Anbieter und Einstellungen so, dass Ihre Daten in der EU verarbeitet werden. Einige Anbieter haben ihren
Sitz in den USA oder nutzen Rechenzentren außerhalb der EU:

- **Vereinigtes Königreich und Schweiz:** möglich beim EU-Geo-Profil von Amazon Bedrock; für beide Länder gibt es
  einen Angemessenheitsbeschluss der EU-Kommission (Art. 45 DSGVO).
- **USA:** Anbieter mit Sitz oder Mutterunternehmen in den USA (Supabase, Vercel, Amazon, Deepgram, Didit, LiveKit,
  Stripe, Apple/Google/Mozilla). Grundlage: [[je Anbieter: Angemessenheitsbeschluss EU-US Data Privacy Framework
  (Art. 45), sofern zertifiziert, sonst Standardvertragsklauseln (Art. 46 Abs. 2 lit. c)]]. Auch bei Verarbeitung in
  der EU ist ein Zugriff von US-Behörden nicht ausgeschlossen.

## 18. Speicherdauer im Überblick

| Daten | Dauer |
|---|---|
| Konto, Angaben, Profil, Einwilligungen, Abende | bis zur Löschung Ihres Kontos |
| Besonders geschützte Angaben | bis zum Widerruf der Einwilligung oder zur Kontolöschung |
| Gesprächstext | 30 Tage |
| Stimme | wird nicht gespeichert |
| Ausweisbilder und -video | nur bei Didit, gelöscht direkt nach dem Ergebnis |
| Teilwerte der Auswahl | 12 Monate |
| Erkennungszeichen | bis zum Ende des Finde-Fensters |
| Erledigte Nachrichten in der Warteschlange | 90 Tage |
| Vertragsunterlagen | [[6 bzw. 8 Jahre]] |
| Meldungen, Sanktionen, Sperrliste | siehe Abschnitt 14 |

Das vollständige Löschkonzept: [loeschkonzept.md](loeschkonzept.md).

## 19. Ihre Rechte

- **Auskunft** (Art. 15) und **Datenübertragbarkeit** (Art. 20): In der App unter „Konto → Meine Daten“ laden Sie
  alle über Sie gespeicherten Daten als Datei herunter (ohne Daten über andere Menschen).
- **Berichtigung** (Art. 16): Angaben ändern Sie in der App; Ihre Zusammenfassung korrigieren Sie jederzeit. Name und
  Geburtsdatum nach der Ausweisprüfung ändern wir auf Anfrage.
- **Löschung** (Art. 17): In der App unter „Konto → Konto löschen“. Wir löschen alles, was nicht aus gesetzlichen
  Gründen aufbewahrt werden muss.
- **Einschränkung** (Art. 18) und **Widerspruch** (Art. 21) gegen Verarbeitungen auf Grundlage berechtigter
  Interessen: per E-Mail an [[Kontakt]].
- **Widerruf von Einwilligungen** (Art. 7 Abs. 3): jederzeit einzeln unter „Konto → Einwilligungen“, mit Wirkung
  für die Zukunft.
- **Menschliche Prüfung** bei der Auswahl (Art. 22 Abs. 3): siehe Abschnitt 10.
- **Beschwerde** bei einer Aufsichtsbehörde (Art. 77), zum Beispiel beim Landesbeauftragten für Datenschutz und
  Informationsfreiheit Mecklenburg-Vorpommern [[zuständige Behörde nach Sitz prüfen]].

## 20. Müssen Sie Daten angeben?

Ohne E-Mail-Adresse, Formularangaben, Angaben zu Geschlecht und gesuchtem Geschlecht und ohne Ausweisprüfung können
wir Ihnen keine Abende vorschlagen. Das Gespräch mit Viola ist nötig, damit wir Sie kennenlernen. Religion,
Orientierung, Telefonnummer, Mitteilungen und Kontakttausch sind freiwillig.

## 21. Änderungen

Wir passen diese Erklärung an, wenn sich Fermata ändert. Die jeweils gültige Fassung steht in der App unter
„Rechtliches“. Ändert sich eine Einwilligung, fragen wir Sie neu.

*Entwurf vom 03.10.2026.*

---

## Offene Punkte für Benn/Anwalt

1. Verantwortlicher, Kontakt, **externer Datenschutzbeauftragter** (B15) eintragen.
2. **Gespräch und Art. 9:** Text der Einwilligung `gespraech` um ungefragt genannte Art.-9-Inhalte ergänzen
   (Verarbeitung live durch Deepgram und Bedrock, keine Speicherung, Ausnahme Sicherheits-Treffer). Der Entwurf des
   KI-Hinweises in der Datenbank (`ops.legal_documents`, Art `ki_hinweis`, M2) sagt „gehen nie an ein Sprachmodell“ –
   das stimmt nur für die gespeicherten Formularangaben.
3. **Bedrock-Weg** festlegen (EU-Geo-Profil mit London/Zürich oder Mantle regional) und Abschnitt 9/17 anpassen.
4. **LiveKit-Weg** (B3) und **Stimme** (B4) eintragen.
5. **Art. 22:** Einordnung des „kein Vorschlag“-Falls und der Hinweis auf die Verlängerungsregel prüfen.
6. **Fairness-Statistik** als Zweck in die Einwilligung `art9_profile` aufnehmen.
7. **Gesundheit:** Abschnitt 7.3 streichen oder Funktion bauen (heute keine Eingabe im Code).
8. **Meldungen:** Art. 9 Abs. 2 lit. f und Art. 10 DSGVO für Schilderungen von Übergriffen prüfen.
9. **Löschfristen** für Meldungen, Protokolle, Vertragsunterlagen festlegen (Löschkonzept) und hier eintragen.
10. Drittland-Grundlage je Anbieter (DPF-Zertifizierung prüfen) und AV-Verträge (av-liste.md).
11. Local Storage für das Farbschema: § 25 Abs. 2 Nr. 2 TDDDG ausreichend?
12. Quellenangabe der PLZ-Mittelpunkte aufnehmen (Abschnitt 6) – Pflicht nach CC BY 4.0.
