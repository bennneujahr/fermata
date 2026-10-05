# Liste der Auftragsverarbeiter und Empfänger (Art. 28 DSGVO)

> **ENTWURF – nicht rechtsverbindlich, Prüfung durch Anwalt/Datenschutzbeauftragten ausstehend.**
> Stand: 03.10.2026. Alle Angaben zu Firmen, Sitz und Vertragsgrundlage sind aus PLAN.md und dem Code übernommen
> und **vor Vertragsschluss beim Anbieter zu prüfen**. Kein Vertrag ist bisher abgeschlossen (Status „TODO“).

## Wie diese Liste zu lesen ist

- **AV** = Auftragsverarbeiter (Vertrag nach Art. 28 Abs. 3 nötig). **Eigene Verantwortung** = der Dienst entscheidet
  teilweise selbst über Zwecke (kein AV-Vertrag, aber Hinweis in der Datenschutzerklärung).
- **Übermittlung:** Grundlage für Daten außerhalb der EU/des EWR: Angemessenheitsbeschluss (Art. 45, z. B.
  EU-US Data Privacy Framework „DPF“, Vereinigtes Königreich, Schweiz) oder Standardvertragsklauseln
  (Art. 46 Abs. 2 lit. c, „SCC“) plus Transfer-Folgenabschätzung (TIA).
- **Einstellungen**, die Benn im Konto des Anbieters setzen muss, stehen im [Runbook](../RUNBOOK.md).

## Auftragsverarbeiter im Betrieb

| # | Anbieter (zu prüfen) | Leistung für Fermata | Daten | Ort laut Konfiguration | Drittland / Übermittlung | Vertrag | Einstellungen, die den Datenschutz betreffen |
|---|---|---|---|---|---|---|---|
| 1 | **Supabase** [[Vertragspartner: Supabase Inc. bzw. EU-Gesellschaft]] | Datenbank, Anmeldung (Auth), Edge Functions, Vault, Backups, Protokolle | alle Mitgliederdaten | AWS Frankfurt (`eu-central-1`); Functions mit fester Region (`x-region: eu-central-1` bzw. `forceFunctionRegion`) | US-Mutter; SCC bzw. DPF prüfen; Unterauftragnehmer AWS | **TODO** (DPA im Dashboard abschließen) | Projekt in Frankfurt anlegen; 2FA für alle Dashboard-Konten; Backups/PITR; Log-Aufbewahrung |
| 2 | **Vercel Inc.** | Auslieferung Landingpage und Web-App, Server-Funktionen | IP, Seitenaufrufe; Web-App: Anmelde-Cookie durchgeleitet | Funktionen `fra1`; statische Dateien über weltweites CDN | USA; DPF/SCC prüfen | **TODO** | Region `fra1` (Landingpage: `apps/landing/vercel.json`; Web-App: noch nicht gesetzt); Analytics/Speed Insights **aus** lassen |
| 3 | **Sendinblue SAS (Brevo)**, Paris | Transaktions-Mails (API) und Mails der Anmeldung (SMTP für Supabase Auth) | E-Mail-Adresse, Mailinhalt (Codes, Fristen, Bestätigungen) | EU [[Rechenzentren prüfen]] | Unterauftragnehmer prüfen | **TODO** | Öffnungs- und Klickverfolgung **aus**; SPF/DKIM/DMARC; Aufbewahrung der Protokolle |
| 4 | **Amazon Web Services EMEA SARL**, Luxemburg | Viola-Dienst und Auswahl-Job (ECS/Fargate), Sprachmodell (Bedrock: Claude Sonnet 5.5, Titan Embeddings), Stimme (Polly), Zeitplan (EventBridge), Geheimnisse (Secrets Manager), Protokolle (CloudWatch), ggf. LiveKit-Server (EC2, Weg C) | Gesprächstext, Profile ohne Art. 9, Stimme als Text | `eu-central-1`; **Bedrock EU-Geo-Profil** verteilt auch nach London und Zürich | US-Mutter; AWS-DPA mit SCC; UK/CH Angemessenheit | **TODO** (AWS GDPR DPA gilt mit den Service Terms – Annahme dokumentieren) | Bedrock-Invocation-Logging ohne Inhalte; AI-Services-Opt-out-Richtlinie (Polly) prüfen; Marketplace-Abo Sonnet 5.5; CloudWatch-Aufbewahrung |
| 4a | Anthropic (Modellanbieter in Bedrock) | stellt das Modell | laut AWS **kein Zugriff** auf Anfragen und Antworten | – | – | kein eigener Vertrag nötig [[bestätigen]] | Direkter Anthropic-Zugang (`VIOLA_LLM_PROVIDER=anthropic`) nur in der Entwicklung, **nie mit echten Daten** |
| 5 | **Deepgram** [[Firma]] | Spracherkennung Nova-3 Deutsch | Audio (live), Text | EU-Endpunkt `api.eu.deepgram.com` | US-Mutter; SCC/DPF prüfen | **TODO** | `mip_opt_out=true` (im Code); Datenaufbewahrung beim Anbieter abschalten [[prüfen]] |
| 6 | **Didit** [[Firma, Sitz]] | Ausweisprüfung mit Gesichtsabgleich | Ausweisbild, Gesichtsvideo, biometrischer Abgleich, ausgelesene Daten | laut Didit EU | Sitz USA (PLAN 5.5); SCC/DPF prüfen | **TODO** | Aufbewahrung **1 Monat** (kürzeste); Training mit Kundendaten **aus**; Webhook-Geheimnis; Sitzungen werden per API gelöscht |
| 7 | **LiveKit Inc.** – nur Weg A/B (Frage B3) | Sprachverbindung (WebRTC) | Audio (live), Raum-Metadaten | Projekt in der EU; Weg B mit Regionsbindung | USA; SCC/DPF prüfen | **TODO, falls A/B** | Aufnahme/Agent-Observability **aus** (Code: `record=False`); bei Weg C entfällt LiveKit als AV |
| 8 | **Stripe Payments Europe Ltd.**, Dublin | Zahlung, Abo, Rechnungen, Erstattungen | E-Mail, interne Kennung, Zahlungsdaten (nur bei Stripe), Rechnungsdaten | Irland | Stripe Inc. (USA); Stripe teils **eigene Verantwortung** | **TODO** (Stripe-DPA) | Live-Modus erst nach Freigabe; Webhook-Geheimnis; Kundenportal nicht nötig |
| 9 | **Google Cloud** – nur falls Stimme nach Blindtest (B4) | Stimme (Chirp 3 HD) | Antworttexte von Viola | EU-Endpunkt `eu-texttospeech.googleapis.com` | US-Mutter | nur bei Wahl | – |
| 10 | **Cartesia**, **ElevenLabs** – nur mit Enterprise-Vertrag (B4) | Stimme | Antworttexte | EU nur mit Enterprise | USA | nur bei Wahl | im Code gesperrt, solange `VIOLA_TTS_ENTERPRISE_EU` nicht gesetzt |

## Empfänger, die keine Auftragsverarbeiter sind

| Empfänger | Was sie erhalten | Einordnung |
|---|---|---|
| Push-Dienste (Apple Push Notification service, Google Firebase Cloud Messaging, Mozilla Push Service) | Ende-zu-Ende-verschlüsselte Nachricht, Abo-Adresse, Zeitpunkt | Transportdienst des Browsers; kein Vertrag möglich; in der Datenschutzerklärung genannt |
| Partner-Lokale | Reservierung ohne Namen (Datum, Uhrzeit, „Fermata“, Tisch-Code, 2 Personen) | eigene Verantwortliche; Vertraulichkeit in der Vereinbarung (B10) |
| Vertrauenspersonen | Lokal, Adresse, Zeit, Vorname über „Abend teilen“ | vom Mitglied gewählt |
| Polizei | nur bei Anzeige | eigene Verantwortliche |
| Steuerberatung | Buchungsunterlagen | Berufsgeheimnis, eigene Verantwortung |
| Externer Datenschutzbeauftragter (B15) | Einsicht nach Bedarf | Vertraulichkeit nach Art. 38 Abs. 5 DSGVO |

## Dienste ohne Mitgliederdaten

| Dienst | Zweck | Hinweis |
|---|---|---|
| GitHub (Repository, CI) | Code, Tests | Tests nutzen erfundene Daten; keine Produktionsdaten oder Geheimnisse ins Repository |
| Domain-Registrar, DNS [[Anbieter]] | Domain (A3) | keine Inhalte; DNS-Einträge für Brevo (SPF/DKIM/DMARC) |

## Prüfliste je Anbieter vor Vertragsschluss

1. Vertragspartner und Sitz feststellen.
2. AV-Vertrag nach Art. 28 Abs. 3 (Gegenstand, Dauer, Art, Zweck, Datenarten, Weisungen, Vertraulichkeit, TOM,
   Unterauftragnehmer, Unterstützung, Löschung/Rückgabe, Nachweise).
3. Liste der Unterauftragnehmer und Widerspruchsrecht.
4. Verarbeitungsort in der Konfiguration festgelegt und dokumentiert.
5. Drittland: DPF-Zertifizierung (Liste des US-Handelsministeriums) oder SCC; TIA bei US-Bezug.
6. Löschung und Aufbewahrung beim Anbieter (Einstellung) dokumentieren.
7. Vertrag ablegen [[Ablageort]], Datum hier eintragen.

## Offene Punkte für Benn/Anwalt

1. Für jeden Anbieter Vertragspartner, DPA und Übermittlungsgrundlage eintragen (Spalte „Vertrag“).
2. Didit: Sitz und Vertragspartner klären (PLAN nennt USA); Alternative Veriff (Estland).
3. LiveKit-Weg B3 entscheiden; bei C entfällt LiveKit als Auftragsverarbeiter.
4. Bedrock: EU-Geo-Profil (London, Zürich) oder regional Frankfurt (Mantle) – beeinflusst die Übermittlungsangaben.
5. Stripe: Abgrenzung AV / eigene Verantwortung in der Datenschutzerklärung.
6. Brevo: Unterauftragnehmer und Rechenzentren prüfen.
