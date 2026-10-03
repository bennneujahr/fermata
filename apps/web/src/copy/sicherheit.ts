// Sicherheit (PLAN 1 Nr. 9, M7): Hilfe, Melden, eigene Meldungen, Sanktionen und Widerspruch, Abend teilen,
// Check-in, öffentliche Seiten für Vertrauensperson und Lokal. Ruhig, ohne Schuldzuweisung.
import { af, type AddressForm } from "./form";

export const titles = {
  hilfe: "Hilfe und Sicherheit",
  sicherheit: "Sicherheit",
  melden: "Etwas melden",
  meldungen: "Meine Meldungen",
  sanktionen: "Hinweise und Widerspruch",
  teilen: "Abend teilen",
  checkin: "Check-in",
  geteilt: "Geteilter Abend",
  lokal: "Reservierung bestätigen",
};

/** Hilfe-Nummern (Beschriftungen; Nummern und Zeiten kommen aus api.help_contacts()). */
export const phones = (f: AddressForm) => ({
  policeCta: (n: string) => `Polizei-Notruf ${n} anrufen`,
  emergencyCta: (n: string) => `Notruf ${n} anrufen`,
  policeText: af(f, "Bei akuter Gefahr – rufen Sie sofort an.", "Bei akuter Gefahr – ruf sofort an."),
  emergencyText: "Rettungsdienst und Feuerwehr.",
  heimwegTitle: "Heimwegtelefon",
  heimwegText: af(
    f,
    "Jemand begleitet Sie am Telefon auf dem Heimweg, bis Sie sicher angekommen sind. Zum normalen Festnetztarif.",
    "Jemand begleitet dich am Telefon auf dem Heimweg, bis du sicher angekommen bist. Zum normalen Festnetztarif.",
  ),
  heimwegCta: (n: string) => `${n} anrufen`,
  hours: (h: string) => `Erreichbar ${h}`,
  seelsorgeTitle: "TelefonSeelsorge",
  seelsorgeText: af(f, "Wenn Sie reden möchten – anonym.", "Wenn du reden möchtest – anonym."),
  gewaltTitle: "Hilfetelefon Gewalt gegen Frauen",
  gewaltText: "Beratung bei Gewalt, auch für Angehörige und Fachleute.",
  call: (n: string) => `${n} anrufen`,
  listLabel: "Hilfe-Nummern",
});

export const help = (f: AddressForm) => ({
  title: "Hilfe und Sicherheit",
  lead: af(
    f,
    "Wenn etwas nicht stimmt, sind Sie nicht allein. Hier finden Sie schnell Hilfe.",
    "Wenn etwas nicht stimmt, bist du nicht allein. Hier findest du schnell Hilfe.",
  ),
  emergencyTitle: "Akute Gefahr",
  emergencyText: af(f, "Rufen Sie sofort die Polizei.", "Ruf sofort die Polizei."),
  moreTitle: "Weitere Hilfe",
  moreText: af(
    f,
    "Rund um die Uhr erreichbar, kostenfrei und auf Wunsch anonym.",
    "Rund um die Uhr erreichbar, kostenfrei und auf Wunsch anonym.",
  ),
  reportTitle: "Etwas melden",
  reportText: af(
    f,
    "Melden Sie Übergriffe, Belästigung oder ein ungutes Gefühl – nach einem Abend oder jederzeit. Wir prüfen jede Meldung, in der Regel innerhalb von 24 Stunden. Die gemeldete Person erfährt nie, wer gemeldet hat.",
    "Melde Übergriffe, Belästigung oder ein ungutes Gefühl – nach einem Abend oder jederzeit. Wir prüfen jede Meldung, in der Regel innerhalb von 24 Stunden. Die gemeldete Person erfährt nie, wer gemeldet hat.",
  ),
  reportCta: "Etwas melden",
  reportLoggedOut: af(
    f,
    "Zum Melden melden Sie sich bitte an. Ohne Konto schreiben Sie uns per E-Mail.",
    "Zum Melden melde dich bitte an. Ohne Konto schreib uns per E-Mail.",
  ),
  shareTitle: "Abend teilen",
  shareText: af(
    f,
    "Mit einem Link sieht eine Vertrauensperson, wo und wann Ihr Abend ist. Der Link läuft 24 Stunden nach Beginn ab.",
    "Mit einem Link sieht eine Vertrauensperson, wo und wann dein Abend ist. Der Link läuft 24 Stunden nach Beginn ab.",
  ),
  shareCta: "Abend teilen",
  safetyCta: "Alles zur Sicherheit",
  standardsTitle: "Unsere Standards",
  standards: [
    "Alle Mitglieder sind volljährig und haben ihren Ausweis gezeigt.",
    "Abende finden in Partner-Lokalen statt, an öffentlichen Orten.",
    af(f, "Ihr Gegenüber erfährt weder Ihren Nachnamen noch Ihre Adresse.", "Dein Gegenüber erfährt weder deinen Nachnamen noch deine Adresse."),
    af(
      f,
      "Kontaktdaten werden nur geteilt, wenn Sie beide nach dem Abend „Ja“ sagen.",
      "Kontaktdaten werden nur geteilt, wenn ihr beide nach dem Abend „Ja“ sagt.",
    ),
  ],
  contactTitle: "Fragen zu Fermata",
  contactText: af(f, "Schreiben Sie uns. Wir antworten persönlich.", "Schreib uns. Wir antworten persönlich."),
  installLink: "Fermata als App installieren",
  note: "Alle Nummern prüfen wir regelmäßig.",
});

export const safety = (f: AddressForm) => ({
  title: "Sicherheit",
  lead: af(
    f,
    "Fermata verabredet Abende nur an öffentlichen Orten, mit Menschen, die ihren Ausweis gezeigt haben. Und wenn doch etwas nicht stimmt, sind wir für Sie da.",
    "Fermata verabredet Abende nur an öffentlichen Orten, mit Menschen, die ihren Ausweis gezeigt haben. Und wenn doch etwas nicht stimmt, sind wir für dich da.",
  ),
  reportTitle: "Etwas melden",
  reportText: af(
    f,
    "Nach einem Abend oder jederzeit. Die gemeldete Person erfährt nie, wer gemeldet hat.",
    "Nach einem Abend oder jederzeit. Die gemeldete Person erfährt nie, wer gemeldet hat.",
  ),
  reportCta: "Jetzt melden",
  shareTitle: "Abend teilen",
  shareText: af(
    f,
    "Eine Vertrauensperson sieht, wo und wann Ihr Abend ist – und kann Sie im Notfall erreichen.",
    "Eine Vertrauensperson sieht, wo und wann dein Abend ist – und kann dich im Notfall erreichen.",
  ),
  shareCta: "Abend teilen",
  shareCount: (n: number) => (n === 1 ? "1 aktiver Link" : `${n} aktive Links`),
  helpTitle: "Hilfe-Nummern",
  helpCta: "Alle Hilfe-Nummern",
  reportsTitle: af(f, "Ihre Meldungen", "Deine Meldungen"),
  reportsCount: (n: number) => (n === 0 ? "Noch keine Meldungen." : n === 1 ? "1 Meldung" : `${n} Meldungen`),
  reportsCta: "Meldungen ansehen",
  sanctionsTitle: "Hinweise und Widerspruch",
  sanctionsNone: af(f, "Gegen Ihr Konto liegt nichts vor.", "Gegen dein Konto liegt nichts vor."),
  sanctionsSome: (n: number) => (n === 1 ? "1 Hinweis oder Sperre" : `${n} Hinweise oder Sperren`),
  sanctionsCta: "Ansehen und Widerspruch einlegen",
  standardsTitle: "Darauf können Sie sich verlassen",
  standards: [
    "Alle Mitglieder sind volljährig und haben ihren Ausweis gezeigt.",
    "Abende finden nur in Partner-Lokalen statt, an öffentlichen Orten. Das Personal weiß Bescheid.",
    af(f, "Ihr Gegenüber erfährt weder Ihren Nachnamen noch Ihre Adresse oder Telefonnummer.", "Dein Gegenüber erfährt weder deinen Nachnamen noch deine Adresse oder Telefonnummer."),
    af(f, "Kontaktdaten werden nur geteilt, wenn Sie beide nach dem Abend „Ja“ sagen.", "Kontaktdaten werden nur geteilt, wenn ihr beide nach dem Abend „Ja“ sagt."),
    "Nach 30 Minuten fragen wir kurz nach, ob alles in Ordnung ist.",
    "Ein Mensch prüft jede Meldung, in der Regel innerhalb von 24 Stunden.",
    "Bei Übergriffen, Bedrohung oder Verdacht auf Minderjährigkeit sperren wir sofort vorläufig.",
    "Gegen jede Entscheidung können Sie Widerspruch einlegen.",
  ],
});

export const contextLabels: Record<string, string> = {
  abend: "Ein Abend",
  termin: "Die Terminabstimmung",
  gespraech: "Das Gespräch mit Viola",
  rueckmeldung: "Eine Rückmeldung",
  konto: "Ein Konto oder Profil",
  sonstiges: "Etwas anderes",
};

export const categoryLabels: Record<string, { label: string; description?: string }> = {
  uebergriff: { label: "Übergriff", description: "körperlich oder sexuell" },
  bedrohung: { label: "Bedrohung" },
  minderjaehrig: { label: "Verdacht auf Minderjährigkeit", description: "die Person wirkt jünger als 18" },
  belaestigung: { label: "Belästigung", description: "zum Beispiel aufdringlich oder anzüglich" },
  diskriminierung: { label: "Diskriminierung" },
  falsche_identitaet: { label: "Falsche Identität", description: "die Person ist nicht, wer sie vorgibt zu sein" },
  betrug: { label: "Betrug", description: "zum Beispiel eine Bitte um Geld" },
  nicht_erschienen: { label: "Nicht erschienen" },
  unangenehm: { label: "Ungutes Gefühl", description: "etwas war unangenehm, ohne dass es einen Namen hat" },
  sonstiges: { label: "Etwas anderes" },
};

export const report = (f: AddressForm) => ({
  title: "Etwas melden",
  lead: af(
    f,
    "Melden Sie Übergriffe, Belästigung oder ein ungutes Gefühl – nach einem Abend oder jederzeit. Ein Mensch prüft jede Meldung, in der Regel innerhalb von 24 Stunden.",
    "Melde Übergriffe, Belästigung oder ein ungutes Gefühl – nach einem Abend oder jederzeit. Ein Mensch prüft jede Meldung, in der Regel innerhalb von 24 Stunden.",
  ),
  anonymous: "Die gemeldete Person erfährt nie, wer gemeldet hat.",
  emergency: af(f, "Akute Gefahr? Rufen Sie sofort die Polizei:", "Akute Gefahr? Ruf sofort die Polizei:"),
  emergencyCta: (n: string) => `${n} anrufen`,
  open: "Etwas melden",
  dialogTitle: "Etwas melden",
  eveningFixed: (label: string) => `Zum Abend ${label}`,
  eveningLabel: "Um welchen Abend geht es?",
  eveningNone: "Keinen bestimmten Abend",
  eveningOption: (name: string | null, date: string) => (name ? `Mit ${name}, ${date}` : date),
  eveningHint: "Freiwillig. Mit dem Abend können wir schneller helfen.",
  contextLegend: "Worum geht es?",
  aboutLegend: "Wen oder was betrifft es?",
  aboutPerson: (name: string | null) => (name ? af(f, `Mein Gegenüber (${name})`, `Mein Gegenüber (${name})`) : "Mein Gegenüber"),
  aboutOther: "Etwas anderes, zum Beispiel das Lokal",
  categoryLegend: "Was ist passiert?",
  zeroTitle: "Null Toleranz",
  zeroText: af(
    f,
    "Bei Übergriff, Bedrohung oder dem Verdacht auf Minderjährigkeit sperren wir das Konto der gemeldeten Person sofort vorläufig und sagen ihre Abende ab, bis wir den Fall geprüft haben. Danach entscheidet ein Mensch.",
    "Bei Übergriff, Bedrohung oder dem Verdacht auf Minderjährigkeit sperren wir das Konto der gemeldeten Person sofort vorläufig und sagen ihre Abende ab, bis wir den Fall geprüft haben. Danach entscheidet ein Mensch.",
  ),
  otherLegend: "Weitere Gründe",
  description: "Was ist passiert?",
  descriptionOptional: "freiwillig",
  descriptionHint: af(
    f,
    "Schreiben Sie so viel oder so wenig, wie Sie möchten. Höchstens 4000 Zeichen.",
    "Schreib so viel oder so wenig, wie du möchtest. Höchstens 4000 Zeichen.",
  ),
  counter: (n: number, max: number) => `${n} von ${max} Zeichen`,
  wantsContact: af(f, "Bitte melden Sie sich bei mir dazu.", "Bitte meldet euch bei mir dazu."),
  wantsContactHint: af(f, "Per E-Mail. Sie können auch ohne Rückfrage melden.", "Per E-Mail. Du kannst auch ohne Rückfrage melden."),
  categoryRequired: "Bitte wählen Sie aus, was passiert ist.",
  contextRequired: "Bitte wählen Sie aus, worum es geht.",
  submit: "Meldung abschicken",
  submitting: "Wird gesendet …",
  cancel: "Abbrechen",
  doneTitle: af(f, "Danke. Ihre Meldung ist bei uns.", "Danke. Deine Meldung ist bei uns."),
  doneText: (due: string) =>
    af(
      f,
      `Ein Mensch schaut sie sich an, in der Regel bis ${due}. Die gemeldete Person erfährt nicht, wer gemeldet hat. Eine Bestätigung bekommen Sie per E-Mail.`,
      `Ein Mensch schaut sie sich an, in der Regel bis ${due}. Die gemeldete Person erfährt nicht, wer gemeldet hat. Eine Bestätigung bekommst du per E-Mail.`,
    ),
  doneUrgent: af(
    f,
    "Weil es um etwas Ernstes geht, kümmern wir uns sofort darum.",
    "Weil es um etwas Ernstes geht, kümmern wir uns sofort darum.",
  ),
  doneUnsafe: af(f, "Fühlen Sie sich gerade unsicher?", "Fühlst du dich gerade unsicher?"),
  doneHelp: "Hilfe-Nummern",
  doneReports: af(f, "Ihre Meldungen ansehen", "Deine Meldungen ansehen"),
  close: "Schließen",
  errors: {
    rate_limited: af(
      f,
      "Sie haben heute schon mehrere Meldungen geschickt. Weitere sind erst morgen wieder möglich. Bei akuter Gefahr wählen Sie bitte 110. Für alles andere schreiben Sie uns gern per E-Mail.",
      "Du hast heute schon mehrere Meldungen geschickt. Weitere sind erst morgen wieder möglich. Bei akuter Gefahr wähl bitte 110. Für alles andere schreib uns gern per E-Mail.",
    ),
    not_related: af(
      f,
      "Diese Meldung können wir so nicht annehmen: Melden lassen sich nur Personen, die Sie über Fermata kennen. Wählen Sie bitte „Etwas anderes“ oder schreiben Sie uns.",
      "Diese Meldung können wir so nicht annehmen: Melden lassen sich nur Personen, die du über Fermata kennst. Wähl bitte „Etwas anderes“ oder schreib uns.",
    ),
    evening_not_found: "Diesen Abend finden wir nicht. Bitte wählen Sie einen anderen oder keinen Abend.",
    self_report: "Sich selbst kann man nicht melden.",
    description_too_long: "Die Beschreibung ist zu lang (höchstens 4000 Zeichen).",
    invalid_context: "Bitte wählen Sie aus, worum es geht.",
    invalid_category: "Bitte wählen Sie aus, was passiert ist.",
    not_authenticated: af(f, "Bitte melden Sie sich erneut an.", "Bitte melde dich erneut an."),
  } as Record<string, string>,
});

export const reportStatus: Record<string, { label: string; tone: "brass" | "success" | "warning" | "wine" }> = {
  open: { label: "eingegangen", tone: "brass" },
  in_review: { label: "in Prüfung", tone: "warning" },
  resolved: { label: "abgeschlossen", tone: "success" },
  dismissed: { label: "geprüft, ohne Maßnahme", tone: "success" },
};

export const myReports = (f: AddressForm) => ({
  title: af(f, "Ihre Meldungen", "Deine Meldungen"),
  lead: af(
    f,
    "Hier sehen Sie, was Sie gemeldet haben und wie weit wir sind. Einzelheiten zur Entscheidung schicken wir Ihnen per E-Mail.",
    "Hier siehst du, was du gemeldet hast und wie weit wir sind. Einzelheiten zur Entscheidung schicken wir dir per E-Mail.",
  ),
  empty: "Noch keine Meldungen",
  emptyText: af(f, "Wenn Sie etwas melden, steht es hier.", "Wenn du etwas meldest, steht es hier."),
  created: (d: string) => `Gemeldet am ${d}`,
  due: (d: string) => `Antwort in der Regel bis ${d}`,
  resolved: (d: string) => `Abgeschlossen am ${d}`,
  unavailable: "Die Meldungen können gerade nicht geladen werden.",
  newReport: "Etwas melden",
});

export const sanctionKinds: Record<string, string> = {
  hinweis: "Hinweis",
  vorlaeufige_sperre: "Vorläufige Sperre",
  sperre: "Sperre",
  ausschluss: "Ausschluss",
};

export const appealStatus: Record<string, { label: string; tone: "brass" | "success" | "danger" }> = {
  open: { label: "eingegangen", tone: "brass" },
  accepted: { label: "angenommen", tone: "success" },
  rejected: { label: "abgelehnt", tone: "danger" },
};

export const sanctions = (f: AddressForm) => ({
  title: "Hinweise und Widerspruch",
  lead: af(
    f,
    "Hier stehen Hinweise und Sperren zu Ihrem Konto. Gegen jede Entscheidung können Sie einmal Widerspruch einlegen. Ein Mensch liest jeden Widerspruch.",
    "Hier stehen Hinweise und Sperren zu deinem Konto. Gegen jede Entscheidung kannst du einmal Widerspruch einlegen. Ein Mensch liest jeden Widerspruch.",
  ),
  empty: af(f, "Gegen Ihr Konto liegt nichts vor", "Gegen dein Konto liegt nichts vor"),
  emptyText: "Hier ist alles in Ordnung.",
  since: (d: string) => `seit ${d}`,
  until: (d: string) => `bis ${d}`,
  unlimited: "ohne Enddatum",
  lifted: (d: string) => `aufgehoben am ${d}`,
  reason: "Begründung",
  provisionalText: af(
    f,
    "Eine vorläufige Sperre gilt, solange wir einen Hinweis prüfen. Das ist noch keine Entscheidung. Wir melden uns per E-Mail.",
    "Eine vorläufige Sperre gilt, solange wir einen Hinweis prüfen. Das ist noch keine Entscheidung. Wir melden uns per E-Mail.",
  ),
  appealTitle: "Widerspruch einlegen",
  appealLabel: af(f, "Warum halten Sie die Entscheidung für falsch?", "Warum hältst du die Entscheidung für falsch?"),
  appealHint: "Mindestens 10, höchstens 4000 Zeichen.",
  appealSubmit: "Widerspruch abschicken",
  appealSubmitting: "Wird gesendet …",
  appealDone: af(
    f,
    "Danke. Ihr Widerspruch ist eingegangen. Wir melden uns per E-Mail.",
    "Danke. Dein Widerspruch ist eingegangen. Wir melden uns per E-Mail.",
  ),
  appealOf: "Widerspruch",
  appealCreated: (d: string) => `eingelegt am ${d}`,
  appealDecided: (d: string) => `entschieden am ${d}`,
  appealNote: "Entscheidung",
  errors: {
    invalid_text: "Bitte schreiben Sie zwischen 10 und 4000 Zeichen.",
    already_appealed: af(f, "Gegen diese Entscheidung haben Sie bereits Widerspruch eingelegt.", "Gegen diese Entscheidung hast du bereits Widerspruch eingelegt."),
    sanction_lifted: "Diese Sanktion ist bereits aufgehoben.",
    sanction_not_found: "Diese Sanktion finden wir nicht.",
    not_authenticated: af(f, "Bitte melden Sie sich erneut an.", "Bitte melde dich erneut an."),
  } as Record<string, string>,
  unavailable: "Die Angaben können gerade nicht geladen werden.",
});

export const trustShare = (f: AddressForm) => ({
  title: "Abend teilen",
  lead: af(
    f,
    "Schicken Sie einer Vertrauensperson einen Link. Sie sieht, wo und wann Ihr Abend ist – und kann Sie im Notfall erreichen.",
    "Schick einer Vertrauensperson einen Link. Sie sieht, wo und wann dein Abend ist – und kann dich im Notfall erreichen.",
  ),
  seesTitle: "Das sieht Ihre Vertrauensperson",
  sees: [
    "das Lokal mit Adresse und Anfahrt",
    "Datum und Uhrzeit",
    af(f, "Ihren Vornamen", "deinen Vornamen"),
    "das Heimwegtelefon und den Notruf 110",
    "bis wann der Link gilt",
  ],
  notSees: af(
    f,
    "Nichts über Ihr Gegenüber – weder Name noch Foto noch Kontakt.",
    "Nichts über dein Gegenüber – weder Name noch Foto noch Kontakt.",
  ),
  expiry: af(
    f,
    "Der Link läuft 24 Stunden nach Beginn des Abends ab oder wenn der Abend abgesagt wird. Sie können ihn jederzeit zurückziehen.",
    "Der Link läuft 24 Stunden nach Beginn des Abends ab oder wenn der Abend abgesagt wird. Du kannst ihn jederzeit zurückziehen.",
  ),
  eveningTitle: (date: string, venue: string | null) => (venue ? `${date} · ${venue}` : date),
  withName: (name: string) => `mit ${name}`,
  create: "Link erstellen",
  creating: "Link wird erstellt …",
  createdTitle: "Ihr Link",
  linkLabel: "Link für Ihre Vertrauensperson",
  copy: "Link kopieren",
  copied: "Kopiert.",
  copyFailed: "Kopieren hat nicht geklappt. Bitte markieren Sie den Link und kopieren Sie ihn selbst.",
  shareNative: "Teilen …",
  shareText: "Hier siehst du, wo und wann mein Abend ist.",
  onlyNow: af(
    f,
    "Diesen Link zeigen wir nur jetzt. Kopieren Sie ihn, bevor Sie die Seite verlassen.",
    "Diesen Link zeigen wir nur jetzt. Kopier ihn, bevor du die Seite verlässt.",
  ),
  activeTitle: "Aktive Links",
  activeItem: (created: string, until: string) => `erstellt ${created}, gültig bis ${until}`,
  revoke: "Zurückziehen",
  revoking: "Wird zurückgezogen …",
  revoked: "Link zurückgezogen.",
  noActive: "Kein aktiver Link.",
  emptyTitle: "Gerade nichts zu teilen",
  emptyText: af(
    f,
    "Sobald ein Abend bestätigt ist, Ort und Zeit also feststehen, können Sie ihn hier teilen.",
    "Sobald ein Abend bestätigt ist, Ort und Zeit also feststehen, kannst du ihn hier teilen.",
  ),
  notFound: "Diesen Abend finden wir nicht.",
  errors: {
    evening_not_found: "Diesen Abend finden wir nicht.",
    evening_not_confirmed: "Teilen geht, sobald Ort und Zeit feststehen.",
    evening_over: "Dieser Abend liegt zu lange zurück.",
    too_many_shares: af(
      f,
      "Sie haben diesen Abend schon dreimal geteilt. Ziehen Sie einen Link zurück, um einen neuen zu erstellen.",
      "Du hast diesen Abend schon dreimal geteilt. Zieh einen Link zurück, um einen neuen zu erstellen.",
    ),
    not_authenticated: af(f, "Bitte melden Sie sich erneut an.", "Bitte melde dich erneut an."),
  } as Record<string, string>,
  unavailable: "Die Abende können gerade nicht geladen werden.",
});

/** Öffentliche Seite für die Vertrauensperson (immer „Sie“). */
export const trustView = {
  loading: "Der geteilte Abend wird geladen …",
  title: (name: string | null) => (name ? `${name} hat einen Abend mit Ihnen geteilt` : "Ein Abend wurde mit Ihnen geteilt"),
  lead: (name: string | null) =>
    `${name ?? "Ein Mitglied"} trifft sich über Fermata mit einer Person zu einem Abend in einem öffentlichen Partner-Lokal und möchte, dass Sie Bescheid wissen.`,
  when: "Wann",
  where: "Wo",
  venueOpen: "Das Lokal steht noch nicht fest.",
  transport: (t: string) => `Anfahrt: ${t}`,
  worryTitle: "Wenn Sie sich Sorgen machen",
  worryText: (name: string | null) =>
    `Rufen Sie ${name ?? "die Person"} am besten direkt an. Wenn Sie niemanden erreichen und Gefahr befürchten, wählen Sie 110.`,
  heimweg: "Heimwegtelefon",
  heimwegText: "Begleitet am Telefon auf dem Heimweg, bis man sicher angekommen ist.",
  police: (n: string) => `Polizei-Notruf ${n} anrufen`,
  call: (n: string) => `${n} anrufen`,
  hours: (h: string) => `Erreichbar ${h}`,
  expires: (d: string) => `Dieser Link gilt bis ${d}. Bitte geben Sie ihn nicht weiter.`,
  privacy: "Der Link zeigt nur, was geteilt werden soll – nichts über das Gegenüber.",
  invalidTitle: "Dieser Link ist nicht mehr gültig",
  invalidText:
    "Der geteilte Abend ist vorbei, wurde abgesagt oder der Link wurde zurückgezogen. Wenn Sie sich Sorgen machen, rufen Sie die Person direkt an. Bei akuter Gefahr wählen Sie 110.",
  missingTitle: "Kein Link",
  missingText: "Diese Seite zeigt einen geteilten Abend, wenn Sie sie über den vollständigen Link öffnen.",
  errorText: "Der Abend kann gerade nicht geladen werden. Bitte laden Sie die Seite gleich noch einmal.",
  retry: "Noch einmal laden",
  about: "Was ist Fermata?",
  aboutText: "Fermata verabredet Abende zwischen zwei Menschen in Partner-Lokalen. Alle Mitglieder haben ihren Ausweis gezeigt.",
};

export const checkin = (f: AddressForm) => ({
  title: af(f, "Wie geht es Ihnen?", "Wie geht es dir?"),
  lead: (venue: string | null) =>
    af(
      f,
      `Ihr Abend${venue ? ` im ${venue}` : ""} hat vor einer Weile begonnen. Eine kurze Antwort genügt – nur Fermata sieht sie, Ihr Gegenüber nicht.`,
      `Dein Abend${venue ? ` im ${venue}` : ""} hat vor einer Weile begonnen. Eine kurze Antwort genügt – nur Fermata sieht sie, dein Gegenüber nicht.`,
    ),
  legend: "Ihre Antwort",
  choices: {
    gut: { label: "Alles gut", description: af(f, "Dann wünschen wir Ihnen einen schönen Abend.", "Dann wünschen wir dir einen schönen Abend.") },
    unsicher: {
      label: "Ich bin unsicher",
      description: af(f, "Wir melden uns bei Ihnen. Die Hilfe-Nummern sehen Sie sofort.", "Wir melden uns bei dir. Die Hilfe-Nummern siehst du sofort."),
    },
    hilfe: {
      label: "Ich brauche Hilfe",
      description: af(f, "Sie sehen sofort die Notrufnummern. Fermata wird informiert.", "Du siehst sofort die Notrufnummern. Fermata wird informiert."),
    },
  },
  sending: "Wird gesendet …",
  gutTitle: "Danke. Schönen Abend noch.",
  gutText: af(
    f,
    "Falls sich etwas ändert, können Sie hier jederzeit erneut antworten oder den Hilfe-Knopf oben nutzen.",
    "Falls sich etwas ändert, kannst du hier jederzeit erneut antworten oder den Hilfe-Knopf oben nutzen.",
  ),
  unsicherTitle: af(f, "Danke, dass Sie Bescheid geben", "Danke, dass du Bescheid gibst"),
  unsicherText: af(
    f,
    "Wir melden uns bei Ihnen. Sie können jederzeit gehen – das Personal im Lokal hilft Ihnen, zum Beispiel mit einem Taxi.",
    "Wir melden uns bei dir. Du kannst jederzeit gehen – das Personal im Lokal hilft dir, zum Beispiel mit einem Taxi.",
  ),
  hilfeTitle: af(f, "Bei Gefahr: Rufen Sie jetzt 110", "Bei Gefahr: Ruf jetzt 110"),
  hilfeText: af(
    f,
    "Wenden Sie sich auch an das Personal im Lokal. Es weiß, was zu tun ist.",
    "Wende dich auch an das Personal im Lokal. Es weiß, was zu tun ist.",
  ),
  informed: "Fermata ist informiert.",
  informing: "Fermata wird informiert …",
  notInformed: af(
    f,
    "Die Nachricht an Fermata ist nicht angekommen. Bitte rufen Sie im Notfall direkt 110 an.",
    "Die Nachricht an Fermata ist nicht angekommen. Bitte ruf im Notfall direkt 110 an.",
  ),
  numberText: (n: string) => `Nummer: ${n}`,
  again: "Andere Antwort geben",
  notFoundTitle: "Diesen Abend finden wir nicht",
  notFoundText: af(
    f,
    "Bei Gefahr rufen Sie bitte sofort 110. Die Hilfe-Nummern finden Sie über den Hilfe-Knopf oben.",
    "Bei Gefahr ruf bitte sofort 110. Die Hilfe-Nummern findest du über den Hilfe-Knopf oben.",
  ),
  alwaysHelp: af(f, "Notruf jederzeit:", "Notruf jederzeit:"),
  reportTitle: "Etwas ist vorgefallen?",
  reportText: af(
    f,
    "Sie können es jederzeit melden – jetzt oder später. Die gemeldete Person erfährt nie, wer gemeldet hat.",
    "Du kannst es jederzeit melden – jetzt oder später. Die gemeldete Person erfährt nie, wer gemeldet hat.",
  ),
  errors: {
    checkin_not_possible: "Für diesen Abend ist gerade kein Check-in möglich.",
    evening_not_found: "Diesen Abend finden wir nicht.",
    invalid_status: "Bitte wählen Sie eine Antwort.",
  } as Record<string, string>,
});

/** Öffentliche Seite für das Lokal (immer „Sie“). */
export const venueConfirm = {
  loading: "Die Reservierung wird geladen …",
  title: "Reservierung bestätigen",
  lead: "Fermata hat bei Ihnen einen Tisch reserviert. Bitte bestätigen Sie kurz, dass das passt.",
  labels: {
    venue: "Lokal",
    date: "Datum",
    time: "Uhrzeit",
    name: "Name der Reservierung",
    code: "Tisch-Code",
    persons: "Personen",
  },
  personsValue: (n: number) => (n === 1 ? "1 Person" : `${n} Personen`),
  guests: (name: string) =>
    `Die beiden Gäste nennen am Abend den Namen „${name}“ und den Tisch-Code. Mehr über die Gäste geben wir nicht weiter.`,
  confirm: "Reservierung bestätigen",
  confirming: "Wird bestätigt …",
  doneTitle: "Danke. Die Reservierung ist bestätigt.",
  doneText: "Wir freuen uns auf den Abend bei Ihnen. Wenn etwas nicht passt, antworten Sie bitte auf unsere E-Mail.",
  alreadyTitle: "Diese Reservierung ist bereits bestätigt",
  alreadyText: (d: string) => `Bestätigt am ${d}. Danke.`,
  cancelledTitle: "Diese Reservierung wurde abgesagt",
  cancelledText: "Bitte geben Sie den Tisch frei. Danke für Ihr Verständnis.",
  invalidTitle: "Dieser Link ist nicht gültig",
  invalidText: "Der Link ist abgelaufen oder unvollständig. Bitte antworten Sie einfach auf unsere E-Mail.",
  missingTitle: "Kein Link",
  missingText: "Bitte öffnen Sie den vollständigen Link aus unserer E-Mail.",
  detailsInMail: "Datum, Uhrzeit und Tisch-Code stehen in unserer E-Mail.",
  errorText: "Das hat gerade nicht geklappt. Bitte versuchen Sie es gleich noch einmal oder antworten Sie auf unsere E-Mail.",
  retry: "Noch einmal versuchen",
};
