// Rechtstexte (ENTWURF bis zur Prüfung durch den Anwalt) und die Links im Fuß jeder Seite.
// Die Texte selbst kommen aus api.legal_document(kind) (ops.legal_documents).

export const legal = {
  title: "Rechtliches",
  lead: "Alle Texte sind Entwürfe, bis die rechtliche Prüfung abgeschlossen ist.",
  missing: "Dieser Text folgt.",
  missingDraft: "Der Text wird gerade rechtlich geprüft und folgt in Kürze. Bei Fragen schreiben Sie uns.",
  back: "Zurück zu Rechtliches",
  version: (v: string) => `Fassung ${v}`,
  draftTitle: "ENTWURF – noch nicht rechtsverbindlich",
  validFrom: (d: string) => `Gültig ab ${d}`,
  /** Reihenfolge auf der Übersicht: zuerst die Pflichtseiten, dann die Einwilligungstexte. */
  order: [
    "impressum",
    "datenschutz",
    "agb",
    "widerruf",
    "ki_hinweis",
    "datenschutz_kenntnis",
    "art9_profile",
    "art9_religion",
    "art9_health",
    "biometrie",
    "gespraech",
    "push",
    "kontakttausch",
  ],
  mainKinds: ["impressum", "datenschutz", "agb", "widerruf", "ki_hinweis"],
  consentsTitle: "Einwilligungstexte",
  kinds: {
    impressum: "Impressum",
    datenschutz: "Datenschutzerklärung",
    agb: "Nutzungsbedingungen",
    widerruf: "Widerrufsbelehrung",
    datenschutz_kenntnis: "Datenschutzhinweise (kurz)",
    ki_hinweis: "Hinweis zu künstlicher Intelligenz",
    art9_profile: "Einwilligung: Geschlecht und gesuchtes Geschlecht",
    art9_religion: "Einwilligung: Religion",
    art9_health: "Einwilligung: Gesundheit",
    biometrie: "Einwilligung: Ausweisprüfung",
    gespraech: "Einwilligung: Gespräch mit Viola",
    push: "Einwilligung: Mitteilungen",
    kontakttausch: "Einwilligung: Kontakt teilen",
  } as Record<string, string>,
  contractTitle: "Verträge",
  contractText: "Kündigen und Widerrufen gehen jederzeit online, auch ohne Anmeldung.",
};

/** Zusätzliche Links im Fuß jeder Seite (§ 312k BGB: Kündigungsknopf ständig verfügbar; § 356a BGB: Widerruf). */
export const footerLinks = {
  withdrawalPolicy: "Widerrufsbelehrung",
  cancel: "Verträge hier kündigen",
  withdraw: "Vertrag widerrufen",
};
