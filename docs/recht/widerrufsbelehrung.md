# Widerrufsbelehrung und Muster-Widerrufsformular

> **ENTWURF – nicht rechtsverbindlich, Prüfung durch Anwalt/Datenschutzbeauftragten ausstehend.**
> Stand: 03.10.2026 · Fassung `widerruf-2026-10-03-entwurf` · Platzhalter in `[[doppelten eckigen Klammern]]`.
> Grundlage: Muster-Widerrufsbelehrung für Dienstleistungen (Anlage 1 zu Art. 246a § 1 Abs. 2 Satz 2 EGBGB),
> angepasst an Fermata. [[Anwalt: Wortlaut mit der seit 19.06.2026 geltenden Fassung (Widerrufsbutton, § 356a BGB)
> abgleichen; das Muster kann sich dadurch geändert haben.]]
> Im Code: Edge Function `billing-withdraw`, SQL `billing.record_withdrawal` (`20261003000630_billing_contract.sql`),
> Beschreibung `docs/bereiche/mitgliedschaft.md` Abschnitt 7. Die Datenbank kennt die Art `widerruf` in
> `ops.legal_documents`, es gibt aber noch keinen Eintrag – nach Freigabe diesen Text dort hinterlegen.

---

## Widerrufsbelehrung

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

| Stufe | Preis je 4 Wochen | Abende | Wertersatz je genutztem Abend |
|---|---|---|---|
| [[Auftakt]] | 49,00 € | 1 | 49,00 € |
| Andante | 149,00 € | 2 | 74,50 € |
| Loge | 299,00 € | 4 | 74,75 € |

Höchstens zahlen Sie den bereits gezahlten Betrag. Der kostenlose erste Abend und Gutschriften zählen nicht.
Den Rest erstatten wir über Stripe auf Ihr ursprüngliches Zahlungsmittel. Bevor Sie den Widerruf bestätigen, zeigt
Ihnen die App die Berechnung.

### Was bei einem Widerruf in Fermata geschieht

- Ihre Mitgliedschaft endet sofort; noch nicht genutzte Abende aus der Mitgliedschaft verfallen.
- Bereits vereinbarte oder in Abstimmung befindliche Abende sagen wir ab. Ihr Gegenüber erhält eine neutrale
  Nachricht und seinen Abend zurück.
- Ihr Konto bleibt bestehen; Sie können es separat löschen.

*Ende der Widerrufsbelehrung.*

---

## Muster-Widerrufsformular

(Wenn Sie den Vertrag widerrufen wollen, dann füllen Sie bitte dieses Formular aus und senden Sie es zurück.)

- An [[Name/Firma]], [[Anschrift]], E-Mail: [[…]]:
- Hiermit widerrufe(n) ich/wir (\*) den von mir/uns (\*) abgeschlossenen Vertrag über die Erbringung der folgenden
  Dienstleistung (\*): Mitgliedschaft bei Fermata, Stufe [[…]], Vertragsnummer [[FM-…]]
- Bestellt am (\*)/erhalten am (\*)
- Name des/der Verbraucher(s)
- Anschrift des/der Verbraucher(s)
- Unterschrift des/der Verbraucher(s) (nur bei Mitteilung auf Papier)
- Datum

(\*) Unzutreffendes streichen.

---

## Wo und wann die Belehrung gezeigt wird (für Benn)

| Stelle | Heute im Code | Soll |
|---|---|---|
| Bestellübersicht vor dem Knopf „Mitgliedschaft zahlungspflichtig abschließen“ | Kurzhinweis aus `billing.withdrawal_note` (ENTWURF) | Kurzhinweis + Link auf diese Belehrung + **Erklärung „Ich verlange, dass Fermata vor Ablauf der Widerrufsfrist beginnt“** (fehlt) |
| Eingangsbestätigung der Bestellung (E-Mail) | Mail-Vorlage `_shared/mail/templates/billing.ts`: nur Kurzhinweis (`billing.withdrawal_note`) und Ende der Widerrufsfrist | vollständige Belehrung und Formular als Text oder Anhang (Vertragsbestätigung auf dauerhaftem Datenträger, § 312f Abs. 2 BGB) |
| Seite „Vertrag widerrufen“ | Edge Function `billing-withdraw` (Schritt 1 Vorschau, Schritt 2 Bestätigung), 14 Tage ab Bestellung (`billing.withdrawal_days`) | wie gebaut |
| Rechtliches in der App | – | diese Belehrung |

## Offene Punkte für Benn/Anwalt

1. **Ausdrückliches Verlangen** des Leistungsbeginns vor Ablauf der Widerrufsfrist wird bei der Bestellung nicht
   abgefragt und nicht gespeichert. Ohne diese Erklärung entfällt nach § 357a Abs. 2 BGB in der Regel der
   Wertersatz. Code-Änderung nötig (`billing.order_summary`, `billing-checkout`, `contract_actions.details`).
2. **Wertersatz-Methode** (B13) bestätigen, insbesondere „kurzfristig abgesagt/nicht erschienen = erbracht“.
3. Muster an die ab 19.06.2026 geltende Fassung anpassen (Hinweis auf die Widerrufsschaltfläche).
4. Mail-Vorlage der Bestellbestätigung um die vollständige Belehrung und das Formular ergänzen (heute nur Kurzhinweis).
5. Widerrufsfrist beginnt mit Vertragsschluss: Zeitpunkt festlegen (Klick oder Eingangsbestätigung, siehe AGB § 7).
6. Belehrung als `ops.legal_documents` (Art `widerruf`) mit Version hinterlegen.
