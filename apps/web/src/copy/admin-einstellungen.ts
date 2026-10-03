// Admin „Einstellungen“: Gruppen, Platzhalter und Verweise auf docs/PLATZHALTER.md.

export const adminSettings = {
  jump: "Springen zu",
  placeholdersTitle: "Platzhalter",
  placeholdersLead: (n: number) =>
    n === 1 ? "1 Einstellung ist noch ein Platzhalter und braucht eine Entscheidung." : `${n} Einstellungen sind noch Platzhalter und brauchen eine Entscheidung.`,
  placeholdersNone: "Keine Platzhalter mehr.",
  onlyPlaceholders: "Nur Platzhalter zeigen",
  showAll: "Alle Einstellungen zeigen",
  question: (q: string) => `Frage ${q}`,
  questionLink: (q: string) => `docs/PLATZHALTER.md, Frage ${q}`,
  docsHint: "Die Fragen stehen in docs/PLATZHALTER.md im Repository.",
  count: (n: number) => (n === 1 ? "1 Einstellung" : `${n} Einstellungen`),
  categories: {
    abend: "Abende",
    auswahl: "Auswahl",
    benachrichtigung: "Benachrichtigungen",
    betrieb: "Betrieb",
    gespraech: "Gespräch mit Viola",
    konto: "Konto",
    landingpage: "Landingpage",
    lokal: "Lokale",
    marke: "Marke, Domain und Kontakt",
    mitgliedschaft: "Mitgliedschaft und Zahlung",
    sicherheit: "Sicherheit",
    warteliste: "Warteliste",
    zeiten: "Zeitenabfrage",
    aufbewahrung: "Aufbewahrung und Löschung",
    loeschung: "Aufbewahrung und Löschung",
    datenschutz: "Datenschutz",
    retention: "Aufbewahrung und Löschung",
  } as Record<string, string>,
};
