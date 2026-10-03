// Mitgliedschaft: Übersicht, Stufen, Bestellung, Kündigungsknopf (§ 312k BGB), Widerrufsbutton (§ 356a BGB).
// Rechtliche Abläufe und Texte sind ENTWURF (Prüfung durch den Anwalt). Feste Knopftexte: LABELS.
import { af, type AddressForm } from "./form";

/** Feste Wortlaute (rechtlich vorgegeben bzw. ENTWURF), gleich wie in supabase/functions/_shared/stripe/support.ts. */
export const LABELS = {
  /** § 312j Abs. 3 BGB: genau dieser Wortlaut auf dem Bestellknopf. */
  orderButton: "Mitgliedschaft zahlungspflichtig abschließen",
  /** § 312k BGB: Einstieg zur Kündigung. */
  cancelEntry: "Verträge hier kündigen",
  /** § 312k BGB: Bestätigungsknopf. */
  cancelConfirm: "Jetzt kündigen",
  /** § 356a BGB: Einstieg zum Widerruf (ENTWURF). */
  withdrawEntry: "Vertrag widerrufen",
  /** § 356a BGB: zweiter Schritt. */
  withdrawConfirm: "Widerruf bestätigen",
} as const;

export const statusLabels: Record<string, string> = {
  free: "Gratisphase",
  pending: "Bestellung eingegangen",
  active: "aktiv",
  cancelled: "gekündigt",
  ended: "beendet",
  past_due: "Zahlung offen",
  withdrawn: "widerrufen",
};

export const titles = {
  overview: "Mitgliedschaft",
  order: "Bestellübersicht",
  result: "Bestellung",
  cancel: "Kündigen",
  withdraw: "Widerrufen",
};

const evenings = (n: number) => (n === 1 ? "1 Abend" : `${n} Abende`);

export const membership = (f: AddressForm) => ({
  title: "Mitgliedschaft",
  lead: af(
    f,
    "Bis einschließlich zum ersten Abend ist Fermata kostenlos und ohne Karte. Danach wählen Sie eine Stufe – bewusst und mit eigenem Knopf.",
    "Bis einschließlich zum ersten Abend ist Fermata kostenlos und ohne Karte. Danach wählst du eine Stufe – bewusst und mit eigenem Knopf.",
  ),
  stateTitle: af(f, "Ihr Stand", "Dein Stand"),
  labels: {
    status: "Status",
    tier: "Stufe",
    contract: "Vertragsnummer",
    orderedAt: "Bestellt am",
    period: "Laufender Zeitraum",
    extended: "Verlängert bis",
    available: "Verfügbare Abende",
    reserved: "Für bestätigte Abende gebunden",
    nextBilling: "Nächste Abbuchung",
    endsAt: "Endet am",
    withdrawUntil: "Widerruf möglich bis",
  },
  periodRange: (from: string, to: string) => `${from} bis ${to}`,
  extendedByRule: "ohne Zahlung verlängert, weil kein Abend zustande kam",
  evenings,
  freeTitle: "Gratisphase",
  freeActive: af(
    f,
    "Ihr erster Abend ist kostenlos, ganz ohne Karte. Erst danach brauchen Sie für neue Vorschläge eine Mitgliedschaft.",
    "Dein erster Abend ist kostenlos, ganz ohne Karte. Erst danach brauchst du für neue Vorschläge eine Mitgliedschaft.",
  ),
  freeActiveMember: af(
    f,
    "Ihr erster Abend bleibt trotzdem kostenlos. Die Abende Ihrer Mitgliedschaft kommen danach dran und bleiben bis zum Ende des Zeitraums erhalten.",
    "Dein erster Abend bleibt trotzdem kostenlos. Die Abende deiner Mitgliedschaft kommen danach dran und bleiben bis zum Ende des Zeitraums erhalten.",
  ),
  freeEnded: (date: string) => af(f, `Ihre Gratisphase endete am ${date}.`, `Deine Gratisphase endete am ${date}.`),
  needMembership: af(
    f,
    "Für neue Vorschläge brauchen Sie jetzt eine Mitgliedschaft.",
    "Für neue Vorschläge brauchst du jetzt eine Mitgliedschaft.",
  ),
  pendingText: af(
    f,
    "Ihre Bestellung ist eingegangen. Sobald die Zahlung bestätigt ist, ist die Mitgliedschaft aktiv.",
    "Deine Bestellung ist eingegangen. Sobald die Zahlung bestätigt ist, ist die Mitgliedschaft aktiv.",
  ),
  pastDueText: af(
    f,
    "Die letzte Zahlung hat nicht geklappt. Bitte prüfen Sie Ihre Zahlungsart – den Link dazu haben wir Ihnen per E-Mail geschickt. Bis dahin gibt es keine neuen Vorschläge.",
    "Die letzte Zahlung hat nicht geklappt. Bitte prüfe deine Zahlungsart – den Link dazu haben wir dir per E-Mail geschickt. Bis dahin gibt es keine neuen Vorschläge.",
  ),
  cancelledText: (date: string) =>
    af(f, `Gekündigt. Ihre Mitgliedschaft läuft noch bis ${date}.`, `Gekündigt. Deine Mitgliedschaft läuft noch bis ${date}.`),
  tiersTitle: "Stufen",
  tiersText: af(
    f,
    "Jede Stufe läuft 4 Wochen und verlängert sich automatisch, bis Sie kündigen. Kündigen geht jederzeit zum Ende des Zeitraums.",
    "Jede Stufe läuft 4 Wochen und verlängert sich automatisch, bis du kündigst. Kündigen geht jederzeit zum Ende des Zeitraums.",
  ),
  perPeriod: "je 4 Wochen",
  eveningsPerPeriod: (n: number) => `${evenings(n)} je 4 Wochen`,
  choose: (name: string) => `${name} wählen`,
  currentTier: af(f, "Ihre Stufe", "Deine Stufe"),
  notOrderable: "Zurzeit nicht buchbar",
  runningHint: af(
    f,
    "Eine andere Stufe können Sie wählen, sobald Ihre jetzige Mitgliedschaft endet.",
    "Eine andere Stufe kannst du wählen, sobald deine jetzige Mitgliedschaft endet.",
  ),
  pendingHint: af(
    f,
    "Eine neue Bestellung ersetzt die noch nicht bezahlte.",
    "Eine neue Bestellung ersetzt die noch nicht bezahlte.",
  ),
  contractTitle: af(f, "Ihr Vertrag", "Dein Vertrag"),
  cancelText: af(
    f,
    "Kündigen geht jederzeit zum Ende des laufenden Zeitraums – mit zwei Schritten, ohne Anruf und ohne Begründung.",
    "Kündigen geht jederzeit zum Ende des laufenden Zeitraums – mit zwei Schritten, ohne Anruf und ohne Begründung.",
  ),
  withdrawText: (until: string) =>
    af(
      f,
      `Sie können den Vertrag bis ${until} ohne Angabe von Gründen widerrufen.`,
      `Du kannst den Vertrag bis ${until} ohne Angabe von Gründen widerrufen.`,
    ),
  noContract: af(
    f,
    "Sie haben gerade keinen laufenden Vertrag. Den Knopf zum Kündigen finden Sie trotzdem jederzeit hier und unten auf jeder Seite.",
    "Du hast gerade keinen laufenden Vertrag. Den Knopf zum Kündigen findest du trotzdem jederzeit hier und unten auf jeder Seite.",
  ),
  historyTitle: "Verlauf",
  historyText: af(
    f,
    "Jede Erklärung speichern wir mit Datum und Uhrzeit und bestätigen sie Ihnen sofort per E-Mail.",
    "Jede Erklärung speichern wir mit Datum und Uhrzeit und bestätigen sie dir sofort per E-Mail.",
  ),
  historyEmpty: "Noch keine Bestellung, Kündigung oder Widerruf.",
  historyUnavailable: "Der Verlauf kann gerade nicht geladen werden.",
  historyKinds: { order: "Bestellung", cancel: "Kündigung", withdraw: "Widerruf" } as Record<string, string>,
  historyEffective: (d: string) => `wirksam ${d}`,
  historyMailed: "Bestätigung per E-Mail verschickt",
  termsLink: "Nutzungsbedingungen",
  loadError: af(
    f,
    "Ihre Mitgliedschaft kann gerade nicht geladen werden. Bitte versuchen Sie es gleich noch einmal.",
    "Deine Mitgliedschaft kann gerade nicht geladen werden. Bitte versuch es gleich noch einmal.",
  ),
});

export const order = (f: AddressForm) => ({
  title: "Bestellübersicht",
  lead: af(
    f,
    "Bitte prüfen Sie alles in Ruhe. Erst mit dem Knopf ganz unten schließen Sie die Mitgliedschaft ab.",
    "Bitte prüf alles in Ruhe. Erst mit dem Knopf ganz unten schließt du die Mitgliedschaft ab.",
  ),
  back: "Zurück zur Mitgliedschaft",
  draft: "ENTWURF",
  draftText: "Die Bedingungen sind ein Entwurf und werden rechtlich geprüft.",
  summaryTitle: af(f, "Was Sie bestellen", "Was du bestellst"),
  labels: {
    tier: "Stufe",
    price: "Preis",
    period: "Laufzeit",
    evenings: "Abende",
    note: "Hinweis",
    renewal: "Verlängerung",
    cancellation: "Kündigung",
    withdrawal: "Widerruf",
    extension: "Verlängerungsregel",
  },
  price: (display: string, vat: string) => `${display} je 4 Wochen (${vat})`,
  perPeriodVat: (vat: string) => `je 4 Wochen, ${vat}`,
  period: (label: string) => `${label}, verlängert sich automatisch`,
  evenings: (n: number) => `${evenings(n)} je Zeitraum`,
  withdrawalPolicy: "Widerrufsbelehrung lesen",
  terms: "Nutzungsbedingungen lesen",
  paymentTitle: "Zahlungsart",
  paymentText: af(
    f,
    "Die Zahlung läuft über Stripe. Ihre Kartendaten sieht Fermata nie.",
    "Die Zahlung läuft über Stripe. Deine Kartendaten sieht Fermata nie.",
  ),
  paymentLoading: "Zahlungsfeld wird geladen …",
  paymentUnavailable: af(
    f,
    "Das Zahlungsfeld kann gerade nicht geladen werden. Bitte laden Sie die Seite neu.",
    "Das Zahlungsfeld kann gerade nicht geladen werden. Bitte lade die Seite neu.",
  ),
  paymentNotConfigured: "Zahlungen sind in dieser Umgebung nicht eingerichtet. Die Bestellung lässt sich hier nur ohne Zahlung testen.",
  startRequestFallback: af(
    f,
    "ENTWURF: Ich möchte, dass Fermata schon vor Ende der Widerrufsfrist mit der Leistung beginnt. Mir ist bekannt, dass ich bei einem Widerruf für bereits genutzte Abende Wertersatz zahle.",
    "ENTWURF: Ich möchte, dass Fermata schon vor Ende der Widerrufsfrist mit der Leistung beginnt. Mir ist bekannt, dass ich bei einem Widerruf für bereits genutzte Abende Wertersatz zahle.",
  ),
  startRequestRequired: af(
    f,
    "Bitte setzen Sie das Häkchen, damit wir mit der Mitgliedschaft beginnen können.",
    "Bitte setz das Häkchen, damit wir mit der Mitgliedschaft beginnen können.",
  ),
  afterButton: af(
    f,
    "Sie bekommen die Bestellbestätigung sofort per E-Mail.",
    "Du bekommst die Bestellbestätigung sofort per E-Mail.",
  ),
  submitting: "Bestellung wird übermittelt …",
  paying: "Zahlung wird bestätigt …",
  paymentFailedTitle: "Die Zahlung hat nicht geklappt",
  paymentFailedText: af(
    f,
    "Ihre Mitgliedschaft ist noch nicht aktiv. Sie können es mit derselben oder einer anderen Zahlungsart noch einmal versuchen.",
    "Deine Mitgliedschaft ist noch nicht aktiv. Du kannst es mit derselben oder einer anderen Zahlungsart noch einmal versuchen.",
  ),
  tierMissingTitle: "Diese Stufe gibt es nicht",
  tierNotOrderable: "Diese Stufe ist zurzeit nicht buchbar.",
  alreadyMemberTitle: af(f, "Sie haben bereits eine Mitgliedschaft", "Du hast bereits eine Mitgliedschaft"),
  errors: {
    start_request_required: af(
      f,
      "Bitte setzen Sie das Häkchen, damit wir mit der Mitgliedschaft beginnen können.",
      "Bitte setz das Häkchen, damit wir mit der Mitgliedschaft beginnen können.",
    ),
    summary_changed: af(
      f,
      "Die Bestellübersicht hat sich gerade geändert. Bitte laden Sie die Seite neu und prüfen Sie sie noch einmal.",
      "Die Bestellübersicht hat sich gerade geändert. Bitte lade die Seite neu und prüf sie noch einmal.",
    ),
    already_member: af(f, "Sie haben bereits eine laufende Mitgliedschaft.", "Du hast bereits eine laufende Mitgliedschaft."),
    suspended: af(
      f,
      "Ihr Konto ist gerade gesperrt. Eine Bestellung ist deshalb nicht möglich.",
      "Dein Konto ist gerade gesperrt. Eine Bestellung ist deshalb nicht möglich.",
    ),
    tier_not_orderable: "Diese Stufe ist zurzeit nicht buchbar.",
    invalid_tier: "Diese Stufe gibt es nicht.",
    payment_provider_error: af(
      f,
      "Die Zahlung kann gerade nicht vorbereitet werden. Bitte versuchen Sie es gleich noch einmal.",
      "Die Zahlung kann gerade nicht vorbereitet werden. Bitte versuch es gleich noch einmal.",
    ),
    not_authenticated: af(f, "Bitte melden Sie sich erneut an.", "Bitte melde dich erneut an."),
    unauthorized: af(f, "Bitte melden Sie sich erneut an.", "Bitte melde dich erneut an."),
    network: af(f, "Keine Verbindung. Bitte prüfen Sie Ihre Internetverbindung.", "Keine Verbindung. Bitte prüf deine Internetverbindung."),
  } as Record<string, string>,
});

export const orderResult = (f: AddressForm) => ({
  successTitle: af(f, "Danke. Ihre Bestellung ist eingegangen.", "Danke. Deine Bestellung ist eingegangen."),
  successText: af(
    f,
    "Sobald die Zahlung bestätigt ist, ist Ihre Mitgliedschaft aktiv. Das dauert meist nur einen Moment. Die Bestätigung haben wir Ihnen per E-Mail geschickt.",
    "Sobald die Zahlung bestätigt ist, ist deine Mitgliedschaft aktiv. Das dauert meist nur einen Moment. Die Bestätigung haben wir dir per E-Mail geschickt.",
  ),
  activeTitle: af(f, "Ihre Mitgliedschaft ist aktiv", "Deine Mitgliedschaft ist aktiv"),
  activeText: af(
    f,
    "Schön, dass Sie dabei sind. Neue Vorschläge kommen wie gewohnt alle 14 Tage.",
    "Schön, dass du dabei bist. Neue Vorschläge kommen wie gewohnt alle 14 Tage.",
  ),
  processingTitle: "Die Zahlung wird noch geprüft",
  processingText: af(
    f,
    "Ihre Bank prüft die Zahlung noch. Wir schreiben Ihnen, sobald sie bestätigt ist.",
    "Deine Bank prüft die Zahlung noch. Wir schreiben dir, sobald sie bestätigt ist.",
  ),
  failedTitle: "Die Zahlung hat nicht geklappt",
  failedText: af(
    f,
    "Ihre Mitgliedschaft ist nicht aktiv, es wurde nichts abgebucht. Sie können es mit einer anderen Zahlungsart noch einmal versuchen.",
    "Deine Mitgliedschaft ist nicht aktiv, es wurde nichts abgebucht. Du kannst es mit einer anderen Zahlungsart noch einmal versuchen.",
  ),
  retry: "Noch einmal versuchen",
  labels: { contract: "Vertragsnummer", orderedAt: "Bestellt am", withdrawUntil: "Widerruf möglich bis", status: "Status" },
  toMembership: "Zur Mitgliedschaft",
});

const kindsCopy = (f: AddressForm, effective: string | null) => ({
  ordentlich: {
    label: "Ordentlich kündigen",
    description: effective
      ? `Zum Ende des laufenden Zeitraums am ${effective}.`
      : "Zum Ende des laufenden Zeitraums.",
  },
  ausserordentlich: {
    label: "Außerordentlich kündigen",
    description: af(f, "Aus wichtigem Grund. Bitte nennen Sie dann den Grund.", "Aus wichtigem Grund. Bitte nenne dann den Grund."),
  },
});

export const cancel = (f: AddressForm) => ({
  title: "Verträge hier kündigen",
  lead: af(
    f,
    "Sie können Ihre Mitgliedschaft jederzeit zum Ende des laufenden Zeitraums kündigen. Prüfen Sie Ihre Angaben und tippen Sie dann auf „Jetzt kündigen“.",
    "Du kannst deine Mitgliedschaft jederzeit zum Ende des laufenden Zeitraums kündigen. Prüf deine Angaben und tipp dann auf „Jetzt kündigen“.",
  ),
  draft: "ENTWURF – der Ablauf wird rechtlich geprüft.",
  step1: "Schritt 1 von 2",
  step1Title: af(f, "Ihre Angaben", "Deine Angaben"),
  step2: "Schritt 2 von 2",
  step2Title: "Kündigung abschicken",
  step2Text: af(
    f,
    "Mit dem Knopf ist Ihre Kündigung sofort wirksam erklärt. Die Eingangsbestätigung mit Datum und Uhrzeit bekommen Sie gleich per E-Mail.",
    "Mit dem Knopf ist deine Kündigung sofort wirksam erklärt. Die Eingangsbestätigung mit Datum und Uhrzeit bekommst du gleich per E-Mail.",
  ),
  contract: "Vertrag",
  contractValue: (number: string, tier: string | null) => (tier ? `${number} (${tier})` : number),
  name: "Name",
  email: "E-Mail-Adresse für die Bestätigung",
  kindLegend: "Art der Kündigung",
  kinds: (effective: string | null) => kindsCopy(f, effective),
  reason: "Grund",
  reasonOptional: "freiwillig",
  reasonHint: af(
    f,
    "Bei einer ordentlichen Kündigung müssen Sie keinen Grund nennen. Bei einer außerordentlichen bitte schon.",
    "Bei einer ordentlichen Kündigung musst du keinen Grund nennen. Bei einer außerordentlichen bitte schon.",
  ),
  effective: "Wirksam zum",
  effectiveNow: "sofort (die Bestellung ist noch nicht bezahlt)",
  submitting: "Kündigung wird gespeichert …",
  doneTitle: af(f, "Ihre Kündigung ist eingegangen", "Deine Kündigung ist eingegangen"),
  doneLabels: { received: "Eingang", contract: "Vertrag", kind: "Art", effective: "Wirksam zum" },
  kindNames: { ordentlich: "ordentlich", ausserordentlich: "außerordentlich" } as Record<string, string>,
  mailSent: (email: string) =>
    af(f, `Die Bestätigung haben wir an ${email} geschickt.`, `Die Bestätigung haben wir an ${email} geschickt.`),
  mailSentNoAddress: af(f, "Die Bestätigung haben wir Ihnen per E-Mail geschickt.", "Die Bestätigung haben wir dir per E-Mail geschickt."),
  mailFailed: af(
    f,
    "Die Bestätigungs-Mail konnte gerade nicht verschickt werden. Ihre Kündigung gilt trotzdem. Bitte speichern oder drucken Sie diese Seite.",
    "Die Bestätigungs-Mail konnte gerade nicht verschickt werden. Deine Kündigung gilt trotzdem. Bitte speichere oder drucke diese Seite.",
  ),
  print: "Seite drucken oder speichern",
  notPossible: {
    no_contract: af(
      f,
      "Für Ihr Konto gibt es gerade keinen laufenden Vertrag. In der Gratisphase gibt es nichts zu kündigen.",
      "Für dein Konto gibt es gerade keinen laufenden Vertrag. In der Gratisphase gibt es nichts zu kündigen.",
    ),
    already_cancelled: af(f, "Ihre Mitgliedschaft ist bereits gekündigt.", "Deine Mitgliedschaft ist bereits gekündigt."),
  } as Record<string, string>,
  alreadyCancelledUntil: (date: string) => `Sie endet am ${date}.`,
  notPossibleTitle: "Nichts zu kündigen",
  errors: {
    reason_required: af(
      f,
      "Bitte nennen Sie bei einer außerordentlichen Kündigung den Grund.",
      "Bitte nenne bei einer außerordentlichen Kündigung den Grund.",
    ),
    invalid_email: af(f, "Bitte geben Sie eine gültige E-Mail-Adresse an.", "Bitte gib eine gültige E-Mail-Adresse an."),
    no_contract: af(f, "Für Ihr Konto gibt es keinen kündbaren Vertrag.", "Für dein Konto gibt es keinen kündbaren Vertrag."),
    already_cancelled: af(f, "Ihre Mitgliedschaft ist bereits gekündigt.", "Deine Mitgliedschaft ist bereits gekündigt."),
    invalid_input: af(
      f,
      "Bitte geben Sie Ihre E-Mail-Adresse und Ihre Vertragsnummer an.",
      "Bitte gib deine E-Mail-Adresse und deine Vertragsnummer an.",
    ),
    name_required: af(f, "Bitte geben Sie Ihren Namen an.", "Bitte gib deinen Namen an."),
    not_authenticated: af(f, "Bitte melden Sie sich erneut an.", "Bitte melde dich erneut an."),
    unauthorized: af(f, "Bitte melden Sie sich erneut an.", "Bitte melde dich erneut an."),
    network: af(f, "Keine Verbindung. Bitte prüfen Sie Ihre Internetverbindung.", "Keine Verbindung. Bitte prüf deine Internetverbindung."),
  } as Record<string, string>,
  back: "Zurück zur Mitgliedschaft",
});

export const cancelPublic = {
  title: "Verträge hier kündigen",
  lead: "Sie können Ihre Fermata-Mitgliedschaft jederzeit zum Ende des laufenden Zeitraums kündigen – auch ohne Anmeldung.",
  how: "So geht es: Sie füllen das Formular aus und tippen auf „Jetzt kündigen“. Als Eingang Ihrer Kündigung gilt dieser Zeitpunkt. Danach schicken wir einen Link an die E-Mail-Adresse Ihres Kontos, mit dem Sie die Kündigung bestätigen.",
  loginHint: "Mit Anmeldung geht es schneller, Ihre Angaben sind dann schon ausgefüllt.",
  login: "Anmelden und kündigen",
  name: "Vor- und Nachname",
  email: "E-Mail-Adresse Ihres Fermata-Kontos",
  contractNumber: "Vertragsnummer",
  contractHint: "Sie steht in Ihrer Bestellbestätigung, zum Beispiel FM-ABCD-EF23.",
  sentTitle: "Danke. Ihre Kündigung ist abgeschickt.",
  sentAt: (date: string, time: string) => `Abgeschickt am ${date} um ${time} Uhr.`,
  sentText:
    "Wenn die Angaben zu einem Vertrag passen, bekommen Sie gleich eine E-Mail mit einem Link. Bitte öffnen Sie ihn und tippen Sie auf „Kündigung bestätigen“. Als Eingang Ihrer Kündigung gilt der Zeitpunkt oben.",
  noMail: "Keine E-Mail bekommen? Prüfen Sie bitte den Spam-Ordner und die Schreibweise der Vertragsnummer.",
  again: "Formular noch einmal ausfüllen",
};

export const withdraw = (f: AddressForm) => ({
  title: "Vertrag widerrufen",
  lead: (until: string) =>
    af(
      f,
      `Sie können Ihren Vertrag bis ${until} ohne Angabe von Gründen widerrufen. Geben Sie Ihren Namen, den Vertrag und Ihre E-Mail-Adresse an und tippen Sie dann auf „Widerruf bestätigen“.`,
      `Du kannst deinen Vertrag bis ${until} ohne Angabe von Gründen widerrufen. Gib deinen Namen, den Vertrag und deine E-Mail-Adresse an und tipp dann auf „Widerruf bestätigen“.`,
    ),
  draft: "ENTWURF – Ablauf und Berechnung des Wertersatzes werden rechtlich geprüft.",
  step1: "Schritt 1 von 2",
  step1Title: af(f, "Ihre Angaben", "Deine Angaben"),
  step2: "Schritt 2 von 2",
  step2Title: "Widerruf abschicken",
  step2Text: af(
    f,
    "Mit dem Knopf ist Ihr Widerruf erklärt. Die Eingangsbestätigung mit Datum und Uhrzeit bekommen Sie sofort per E-Mail.",
    "Mit dem Knopf ist dein Widerruf erklärt. Die Eingangsbestätigung mit Datum und Uhrzeit bekommst du sofort per E-Mail.",
  ),
  name: "Name",
  contractNumber: "Vertragsnummer",
  email: "E-Mail-Adresse für die Bestätigung",
  moneyTitle: "Was mit dem Geld passiert",
  money: { paid: "Bezahlt", used: "Genutzte Abende", value: "Wertersatz", refund: "Erstattung" },
  valueDetail: (n: number, per: string) => `${evenings(n)} × ${per}`,
  moneyNote: af(
    f,
    "Der Gratis-Abend und Gutschriften zählen nicht. Die Erstattung geht auf das Zahlungsmittel zurück, mit dem Sie bezahlt haben.",
    "Der Gratis-Abend und Gutschriften zählen nicht. Die Erstattung geht auf das Zahlungsmittel zurück, mit dem du bezahlt hast.",
  ),
  whatTitle: "Was danach passiert",
  what: [
    "Die Mitgliedschaft endet sofort, es wird nichts mehr abgebucht.",
    af(
      f,
      "Offene und bevorstehende Abende sagen wir ab. Ihr Gegenüber erfährt keinen Grund und bekommt den Abend zurück.",
      "Offene und bevorstehende Abende sagen wir ab. Dein Gegenüber erfährt keinen Grund und bekommt den Abend zurück.",
    ),
    "Übrige Abende verfallen.",
  ],
  submitting: "Widerruf wird gespeichert …",
  doneTitle: af(f, "Ihr Widerruf ist eingegangen", "Dein Widerruf ist eingegangen"),
  doneLabels: { received: "Eingang", contract: "Vertrag", refund: "Erstattung", evenings: "Abgesagte Abende" },
  refundStatus: {
    ok: "wird erstattet",
    pending: "wird erstattet",
    manual: "wird von Hand bearbeitet – wir melden uns",
    none: "keine, es wurde nichts bezahlt",
  } as Record<string, string>,
  mailSent: (email: string) => `Die Bestätigung haben wir an ${email} geschickt.`,
  mailSentNoAddress: af(f, "Die Bestätigung haben wir Ihnen per E-Mail geschickt.", "Die Bestätigung haben wir dir per E-Mail geschickt."),
  mailFailed: af(
    f,
    "Die Bestätigungs-Mail konnte gerade nicht verschickt werden. Ihr Widerruf gilt trotzdem. Bitte speichern oder drucken Sie diese Seite.",
    "Die Bestätigungs-Mail konnte gerade nicht verschickt werden. Dein Widerruf gilt trotzdem. Bitte speichere oder drucke diese Seite.",
  ),
  print: "Seite drucken oder speichern",
  notPossibleTitle: "Widerruf nicht möglich",
  notPossible: {
    no_contract: af(f, "Für Ihr Konto gibt es keinen Vertrag, den Sie widerrufen könnten.", "Für dein Konto gibt es keinen Vertrag, den du widerrufen könntest."),
    already_withdrawn: af(f, "Sie haben diesen Vertrag bereits widerrufen.", "Du hast diesen Vertrag bereits widerrufen."),
    period_over: af(
      f,
      "Die Widerrufsfrist ist abgelaufen. Kündigen geht weiterhin jederzeit zum Ende des Zeitraums.",
      "Die Widerrufsfrist ist abgelaufen. Kündigen geht weiterhin jederzeit zum Ende des Zeitraums.",
    ),
  } as Record<string, string>,
  toCancel: LABELS.cancelEntry,
  errors: {
    name_required: af(f, "Bitte geben Sie Ihren Namen an.", "Bitte gib deinen Namen an."),
    contract_required: af(f, "Bitte geben Sie Ihre Vertragsnummer an.", "Bitte gib deine Vertragsnummer an."),
    contract_mismatch: af(
      f,
      "Die Vertragsnummer passt nicht zu Ihrem Konto. Sie steht in Ihrer Bestellbestätigung.",
      "Die Vertragsnummer passt nicht zu deinem Konto. Sie steht in deiner Bestellbestätigung.",
    ),
    invalid_email: af(f, "Bitte geben Sie eine gültige E-Mail-Adresse an.", "Bitte gib eine gültige E-Mail-Adresse an."),
    period_over: "Die Widerrufsfrist ist abgelaufen.",
    already_withdrawn: af(f, "Sie haben diesen Vertrag bereits widerrufen.", "Du hast diesen Vertrag bereits widerrufen."),
    no_contract: af(f, "Für Ihr Konto gibt es keinen Vertrag zum Widerrufen.", "Für dein Konto gibt es keinen Vertrag zum Widerrufen."),
    invalid_input: af(
      f,
      "Bitte geben Sie Ihre E-Mail-Adresse und Ihre Vertragsnummer an.",
      "Bitte gib deine E-Mail-Adresse und deine Vertragsnummer an.",
    ),
    not_authenticated: af(f, "Bitte melden Sie sich erneut an.", "Bitte melde dich erneut an."),
    unauthorized: af(f, "Bitte melden Sie sich erneut an.", "Bitte melde dich erneut an."),
    network: af(f, "Keine Verbindung. Bitte prüfen Sie Ihre Internetverbindung.", "Keine Verbindung. Bitte prüf deine Internetverbindung."),
  } as Record<string, string>,
  back: "Zurück zur Mitgliedschaft",
});

export const withdrawPublic = {
  title: "Vertrag widerrufen",
  lead: "Sie können Ihre Fermata-Mitgliedschaft innerhalb von 14 Tagen nach der Bestellung ohne Angabe von Gründen widerrufen – auch ohne Anmeldung.",
  how: "So geht es: Sie geben Ihren Namen, die E-Mail-Adresse Ihres Kontos und die Vertragsnummer an und tippen auf „Widerruf bestätigen“. Als Eingang Ihres Widerrufs gilt dieser Zeitpunkt. Danach schicken wir einen Link an die E-Mail-Adresse Ihres Kontos, mit dem Sie den Widerruf noch einmal bestätigen.",
  loginHint: "Mit Anmeldung sehen Sie vorher, wie viel wir erstatten.",
  login: "Anmelden und widerrufen",
  name: "Vor- und Nachname",
  email: "E-Mail-Adresse Ihres Fermata-Kontos",
  contractNumber: "Vertragsnummer",
  contractHint: "Sie steht in Ihrer Bestellbestätigung, zum Beispiel FM-ABCD-EF23.",
  sentTitle: "Danke. Ihr Widerruf ist abgeschickt.",
  sentAt: (date: string, time: string) => `Abgeschickt am ${date} um ${time} Uhr.`,
  sentText:
    "Wenn die Angaben zu einem Vertrag passen, bekommen Sie gleich eine E-Mail mit einem Link. Bitte öffnen Sie ihn und tippen Sie auf „Widerruf bestätigen“. Als Eingang Ihres Widerrufs gilt der Zeitpunkt oben.",
  noMail: "Keine E-Mail bekommen? Prüfen Sie bitte den Spam-Ordner und die Schreibweise der Vertragsnummer.",
  again: "Formular noch einmal ausfüllen",
};

export const required = "Pflichtfeld";

/** Bestätigungsseiten für Links aus der Mail (ohne Anmeldung). */
export const contractLink = {
  cancel: {
    title: "Kündigung bestätigen",
    lead: "Sie haben die Kündigung ohne Anmeldung abgeschickt. Bitte bestätigen Sie sie hier.",
    button: "Kündigung bestätigen",
    doneTitle: "Ihre Kündigung ist eingegangen",
    doneText: "Die Bestätigung mit Datum und Uhrzeit haben wir Ihnen per E-Mail geschickt.",
    effective: "Wirksam zum",
  },
  withdraw: {
    title: "Widerruf bestätigen",
    lead: "Sie haben den Widerruf ohne Anmeldung abgeschickt. Bitte bestätigen Sie ihn hier.",
    button: "Widerruf bestätigen",
    doneTitle: "Ihr Widerruf ist eingegangen",
    doneText: "Die Eingangsbestätigung mit Datum und Uhrzeit haben wir Ihnen per E-Mail geschickt.",
    effective: "Wirksam ab",
  },
  labels: { contract: "Vertrag", requested: "Abgeschickt am", received: "Eingang" },
  loading: "Einen Moment, wir prüfen den Link …",
  ignore: "Wenn Sie das nicht möchten, schließen Sie diese Seite einfach. Ohne Klick passiert nichts.",
  missingTitle: "Kein Link gefunden",
  missingText: "Bitte öffnen Sie den Link genau so, wie er in der E-Mail steht.",
  invalidTitle: "Dieser Link gilt nicht mehr",
  invalidText: "Der Link ist abgelaufen oder wurde schon benutzt. Sie können das Formular einfach noch einmal ausfüllen.",
  errorText: "Das hat gerade nicht geklappt. Bitte versuchen Sie es in einem Moment noch einmal.",
  retry: "Noch einmal versuchen",
  again: { cancel: { href: "/kuendigen", label: "Zum Kündigungsformular" }, withdraw: { href: "/widerrufen", label: "Zum Widerrufsformular" } },
};
