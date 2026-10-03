// Onboarding (PLAN 2.3 Nr. 3): Einwilligungen einzeln → Angaben → Identität → Ausweis.
import { af, type AddressForm } from "./form";

export const stepLabels: Record<string, string> = {
  einwilligungen: "Einwilligungen",
  angaben: "Angaben",
  identitaet: "Über Sie",
  ausweis: "Ausweis",
};

export function stepLabel(key: string, f: AddressForm): string {
  if (key === "identitaet") return af(f, "Über Sie", "Über dich");
  return stepLabels[key] ?? key;
}

export const stepper = {
  label: "Fortschritt",
  done: "erledigt",
  current: "aktueller Schritt",
  todo: "offen",
  stepOf: (n: number, total: number) => `Schritt ${n} von ${total}`,
};

export const consentStep = (f: AddressForm) => ({
  title: "Einwilligungen",
  lead: af(
    f,
    "Bevor es losgeht, brauchen wir Ihre Zustimmung – Schritt für Schritt, jede einzeln. Lesen Sie in Ruhe; Sie können jede Einwilligung später widerrufen.",
    "Bevor es losgeht, brauchen wir deine Zustimmung – Schritt für Schritt, jede einzeln. Lies in Ruhe; du kannst jede Einwilligung später widerrufen.",
  ),
  progress: (n: number, total: number) => `Einwilligung ${n} von ${total}`,
  checkbox: {
    agb: af(f, "Ich habe die Nutzungsbedingungen gelesen und stimme ihnen zu.", "Ich habe die Nutzungsbedingungen gelesen und stimme ihnen zu."),
    datenschutz_kenntnis: "Ich habe die Datenschutzhinweise zur Kenntnis genommen.",
    art9_profile: "Ich willige ausdrücklich ein, dass Fermata mein Geschlecht, das gesuchte Geschlecht und freiwillig meine Orientierung wie beschrieben verarbeitet.",
    art9_religion: "Ich willige ausdrücklich ein, dass Fermata meine Angaben zur Religion wie beschrieben verarbeitet.",
    biometrie: "Ich willige ausdrücklich ein, dass Didit meinen Ausweis und mein Gesicht wie beschrieben prüft.",
    push: "Ich möchte Mitteilungen auf diesem Gerät bekommen.",
    gespraech: "Ich willige ein, dass mein Gespräch mit Viola wie beschrieben verarbeitet wird.",
    kontakttausch: "Ich willige ein, meine Kontaktdaten wie beschrieben zu teilen.",
  } as Record<string, string>,
  submit: "Zustimmen und weiter",
  required: af(f, "Bitte setzen Sie das Häkchen, um fortzufahren.", "Bitte setz das Häkchen, um fortzufahren."),
  version: (v: string) => `Fassung ${v}`,
  why: af(
    f,
    "Warum einzeln? So sehen Sie genau, wozu Sie zustimmen, und wir können es nachweisen.",
    "Warum einzeln? So siehst du genau, wozu du zustimmst, und wir können es nachweisen.",
  ),
  missingDoc: "Dieser Text fehlt noch. Bitte versuchen Sie es später noch einmal.",
  versionMismatch: "Der Text wurde gerade aktualisiert. Bitte lesen Sie die neue Fassung.",
});

export const factsStep = (f: AddressForm) => ({
  title: af(f, "Ihre Angaben", "Deine Angaben"),
  lead: af(
    f,
    "Diese Angaben sieht Ihr Gegenüber nie. Wir brauchen sie, um Ihren Ausweis abzugleichen und Abende in Ihrer Nähe zu finden.",
    "Diese Angaben sieht dein Gegenüber nie. Wir brauchen sie, um deinen Ausweis abzugleichen und Abende in deiner Nähe zu finden.",
  ),
  firstName: "Vorname",
  firstNameHint: "Wie im Ausweis. Mehrere Vornamen sind möglich.",
  lastName: "Nachname",
  birthDate: "Geburtsdatum",
  birthDateHint: "Fermata ist ab 18 Jahren.",
  postalCode: "Postleitzahl",
  postalCodeHint: "Für die Auswahl nutzen wir nur den Mittelpunkt Ihrer Postleitzahl, nie Ihre Anschrift.",
  city: "Ort",
  street: "Straße und Hausnummer",
  phone: "Telefonnummer (freiwillig)",
  phoneHint: af(f, "Nur, falls Sie am Abend eine SMS-Erinnerung möchten. Sie können das Feld leer lassen.", "Nur, falls du am Abend eine SMS-Erinnerung möchtest. Du kannst das Feld leer lassen."),
  submit: "Speichern und weiter",
  locked: af(
    f,
    "Name und Geburtsdatum sind mit Ihrem Ausweis abgeglichen und lassen sich nicht mehr ändern. Bei einem Fehler schreiben Sie uns bitte.",
    "Name und Geburtsdatum sind mit deinem Ausweis abgeglichen und lassen sich nicht mehr ändern. Bei einem Fehler schreib uns bitte.",
  ),
  errors: {
    invalid_name: "Bitte geben Sie Vor- und Nachnamen ohne Ziffern und Sonderzeichen ein.",
    invalid_birth_date: "Bitte geben Sie ein gültiges Geburtsdatum ein.",
    too_young: "Fermata ist erst ab 18 Jahren möglich.",
    invalid_postal_code: "Die Postleitzahl hat fünf Ziffern.",
    unknown_postal_code: "Diese Postleitzahl kennen wir nicht. Bitte prüfen Sie sie.",
    invalid_city: "Bitte prüfen Sie den Ort.",
    invalid_phone: "Bitte geben Sie die Telefonnummer nur mit Ziffern, Leerzeichen und + ein.",
    street_not_collected: "Die Straße fragen wir nicht ab.",
    invalid_street: "Bitte prüfen Sie die Straße.",
    facts_locked: "Name und Geburtsdatum sind bereits geprüft.",
    consent_missing: "Bitte erteilen Sie zuerst die Einwilligungen.",
  } as Record<string, string>,
  required: "Bitte füllen Sie dieses Feld aus.",
  privacyNote: af(
    f,
    "Gespeichert in Frankfurt am Main. Sie können die Angaben jederzeit unter „Konto“ einsehen, ändern oder löschen.",
    "Gespeichert in Frankfurt am Main. Du kannst die Angaben jederzeit unter „Konto“ einsehen, ändern oder löschen.",
  ),
});

export const identityStep = (f: AddressForm) => ({
  title: af(f, "Über Sie", "Über dich"),
  lead: af(
    f,
    "Diese Angaben sind besonders geschützt. Sie liegen verschlüsselt vor, und die Auswahl erfährt nur, ob zwei Menschen zueinander passen.",
    "Diese Angaben sind besonders geschützt. Sie liegen verschlüsselt vor, und die Auswahl erfährt nur, ob zwei Menschen zueinander passen.",
  ),
  gender: af(f, "Ich bin", "Ich bin"),
  genders: { frau: "eine Frau", mann: "ein Mann", nichtbinaer: "nichtbinär" } as Record<string, string>,
  seeking: af(f, "Ich möchte kennenlernen", "Ich möchte kennenlernen"),
  seekingHint: "Mehrere Antworten sind möglich.",
  seekingOptions: { frau: "Frauen", mann: "Männer", nichtbinaer: "nichtbinäre Menschen" } as Record<string, string>,
  orientation: "Orientierung (freiwillig)",
  orientationHint: "Für die Auswahl nicht nötig. Lassen Sie das Feld leer, wenn Sie es nicht angeben möchten.",
  orientations: {
    "": "Keine Angabe",
    hetero: "heterosexuell",
    homo: "homosexuell",
    bi: "bisexuell",
    pan: "pansexuell",
    queer: "queer",
    asexuell: "asexuell",
    andere: "anders",
  } as Record<string, string>,
  addressForm: "Wie dürfen wir Sie ansprechen?",
  addressForms: { sie: "Mit „Sie“", du: "Mit „Du“" } as Record<string, string>,
  addressFormHint: "Das gilt für die App und das Gespräch mit Viola. Sie können es jederzeit ändern.",
  religionToggle: "Religion angeben (freiwillig)",
  religionLead: af(
    f,
    "Nur, wenn Ihnen Religion bei einem Gegenüber wichtig ist. Dafür braucht es eine eigene Einwilligung.",
    "Nur, wenn dir Religion bei einem Gegenüber wichtig ist. Dafür braucht es eine eigene Einwilligung.",
  ),
  religion: "Religion oder Weltanschauung",
  religionImportance: af(f, "Wie wichtig ist sie Ihnen?", "Wie wichtig ist sie dir?"),
  importances: { "": "Keine Angabe", unwichtig: "nicht wichtig", etwas: "etwas wichtig", wichtig: "sehr wichtig" } as Record<string, string>,
  religionMustMatch: "Mein Gegenüber soll dieselbe Religion haben.",
  religionConsentMissing: "Für die Angaben zur Religion braucht es Ihre Einwilligung. Setzen Sie bitte das Häkchen oder leeren Sie die Felder.",
  religionSaved: "Religionsangaben gespeichert.",
  submit: "Speichern und weiter",
  errors: {
    gender: "Bitte wählen Sie eine Antwort.",
    seeking: "Bitte wählen Sie mindestens eine Antwort.",
    consent_missing: "Bitte erteilen Sie zuerst die Einwilligung für diese Angaben.",
  } as Record<string, string>,
});

export const verifyStep = (f: AddressForm) => ({
  title: af(f, "Ihr Ausweis", "Dein Ausweis"),
  lead: af(
    f,
    "Bei Fermata sind nur echte, volljährige Menschen. Deshalb prüfen wir einmal Ihren Ausweis – das dauert etwa drei Minuten.",
    "Bei Fermata sind nur echte, volljährige Menschen. Deshalb prüfen wir einmal deinen Ausweis – das dauert etwa drei Minuten.",
  ),
  howTitle: "So funktioniert es",
  how: [
    af(f, "Sie fotografieren Ihren Ausweis und machen ein kurzes Video Ihres Gesichts.", "Du fotografierst deinen Ausweis und machst ein kurzes Video deines Gesichts."),
    "Unser Prüfdienst Didit vergleicht beides und meldet uns nur: volljährig, Geburtsjahr, Name und Geburtsdatum stimmen.",
    "Direkt danach lassen wir die Prüfung bei Didit löschen. Bilder und Ausweisnummer speichern wir nie.",
  ],
  consentTitle: "Einwilligung zur Ausweisprüfung",
  start: "Ausweis jetzt prüfen",
  starting: "Wird vorbereitet …",
  redirectNote: af(f, "Sie werden zu Didit weitergeleitet und kommen danach hierher zurück.", "Du wirst zu Didit weitergeleitet und kommst danach hierher zurück."),
  alternativeTitle: "Ohne Gesichtsabgleich?",
  alternativeText: af(
    f,
    "Eine Prüfung ohne biometrische Daten, zum Beispiel persönlich in einem Partner-Lokal, ist in Vorbereitung. Wenn Sie darauf warten möchten, schreiben Sie uns.",
    "Eine Prüfung ohne biometrische Daten, zum Beispiel persönlich in einem Partner-Lokal, ist in Vorbereitung. Wenn du darauf warten möchtest, schreib uns.",
  ),
  states: {
    started: af(f, "Ihre Prüfung ist begonnen, aber noch nicht abgeschlossen.", "Deine Prüfung ist begonnen, aber noch nicht abgeschlossen."),
    in_review: af(f, "Didit sieht sich Ihre Prüfung noch einmal genauer an. Das kann ein paar Stunden dauern; wir schreiben Ihnen.", "Didit sieht sich deine Prüfung noch einmal genauer an. Das kann ein paar Stunden dauern; wir schreiben dir."),
    approved: af(f, "Ihr Ausweis ist geprüft. Danke.", "Dein Ausweis ist geprüft. Danke."),
    declined: af(f, "Die Prüfung hat nicht geklappt.", "Die Prüfung hat nicht geklappt."),
    expired: af(f, "Die Prüfung wurde nicht abgeschlossen.", "Die Prüfung wurde nicht abgeschlossen."),
    error: "Bei der Prüfung ist ein technischer Fehler passiert.",
    blocked: af(f, "Wir können Ihr Konto zurzeit nicht freischalten. Wir melden uns per E-Mail.", "Wir können dein Konto zurzeit nicht freischalten. Wir melden uns per E-Mail."),
  } as Record<string, string>,
  mismatchName: af(f, "Der Name im Ausweis passt nicht zu Ihren Angaben. Prüfen Sie bitte Vor- und Nachnamen.", "Der Name im Ausweis passt nicht zu deinen Angaben. Prüf bitte Vor- und Nachnamen."),
  mismatchBirth: af(f, "Das Geburtsdatum im Ausweis passt nicht zu Ihren Angaben.", "Das Geburtsdatum im Ausweis passt nicht zu deinen Angaben."),
  notAdult: "Fermata ist erst ab 18 Jahren möglich.",
  fixFacts: "Angaben prüfen",
  attemptsLeft: (n: number) => (n === 1 ? "Noch ein Versuch möglich." : `Noch ${n} Versuche möglich.`),
  noAttempts: af(f, "Es sind keine weiteren Versuche möglich. Bitte schreiben Sie uns, wir helfen weiter.", "Es sind keine weiteren Versuche möglich. Bitte schreib uns, wir helfen weiter."),
  errors: {
    consent_missing: "Bitte erteilen Sie zuerst die Einwilligung zur Ausweisprüfung.",
    facts_missing: "Bitte füllen Sie zuerst Ihre Angaben aus.",
    already_verified: "Ihr Ausweis ist bereits geprüft.",
    verification_pending: "Ihre Prüfung läuft noch.",
    too_many_attempts: "Es sind keine weiteren Versuche möglich.",
    provider_unavailable: "Der Prüfdienst ist gerade nicht erreichbar. Bitte versuchen Sie es in ein paar Minuten noch einmal.",
  } as Record<string, string>,
});

export const returnPage = (f: AddressForm) => ({
  title: "Danke",
  waiting: af(f, "Wir warten auf das Ergebnis Ihrer Prüfung. Das dauert meist weniger als eine Minute.", "Wir warten auf das Ergebnis deiner Prüfung. Das dauert meist weniger als eine Minute."),
  stillWaiting: af(f, "Das Ergebnis ist noch nicht da. Sie können diese Seite schließen; wir schreiben Ihnen, sobald es vorliegt.", "Das Ergebnis ist noch nicht da. Du kannst diese Seite schließen; wir schreiben dir, sobald es vorliegt."),
  approvedTitle: af(f, "Ihr Ausweis ist geprüft", "Dein Ausweis ist geprüft"),
  approvedText: af(f, "Damit ist Ihr Konto eingerichtet. Als Nächstes folgt das Gespräch mit Viola.", "Damit ist dein Konto eingerichtet. Als Nächstes folgt das Gespräch mit Viola."),
  toStart: "Zur Startseite",
  toStep: "Zurück zur Ausweisprüfung",
});

export const simulation = {
  title: "Ausweisprüfung (Simulation)",
  lead: "Diese Seite gibt es nur lokal und in Tests (DIDIT_MODE=fake). Sie ersetzt Didit und schickt ein signiertes Ergebnis wie Didit.",
  scenarios: {
    approve: "Ausweis bestätigen",
    decline: "Ausweis ablehnen",
    name: "Anderer Name im Ausweis",
    minor: "Ausweis einer 17-jährigen Person",
    review: "Manuelle Prüfung",
  } as Record<string, string>,
  unavailable: "Die Simulation ist hier nicht verfügbar.",
  session: (id: string) => `Sitzung ${id}`,
};

export const doneStep = (f: AddressForm) => ({
  title: af(f, "Alles eingerichtet", "Alles eingerichtet"),
  text: af(f, "Ihr Konto ist bereit. Als Nächstes lernen Sie Viola kennen.", "Dein Konto ist bereit. Als Nächstes lernst du Viola kennen."),
});
