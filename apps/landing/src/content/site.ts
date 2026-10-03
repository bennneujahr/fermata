// Texte, die auf allen Seiten vorkommen: Kopf, Fuß, Metadaten.
import { settings } from "../settings";

export const site = {
  name: "Fermata",
  title: "Fermata – Dating ohne Wischen. Ein echter Abend.",
  description:
    "Fermata verabredet echte Abende statt endloser Profile: ein Gespräch mit Viola, alle 14 Tage ein von Menschen geprüfter Vorschlag, ein Tisch in einem Partner-Lokal. Zuerst in Westmecklenburg.",
  locale: "de_DE",
  skipLink: "Zum Inhalt springen",
  homeLabel: "Fermata, zur Startseite",
  nav: [
    { href: "/#ablauf", label: "Ablauf" },
    { href: "/#viola", label: "Viola" },
    { href: "/#sicherheit", label: "Sicherheit" },
    { href: "/#preise", label: "Preise" },
    { href: "/#fragen", label: "Fragen" },
  ],
  navLabel: "Hauptnavigation",
  cta: { href: "/#warteliste", label: "Zur Warteliste" },
  footer: {
    tagline: "Dating ohne Wischen. Echte Abende, zuerst in Westmecklenburg.",
    columns: [
      {
        title: "Fermata",
        links: [
          { href: "/#ablauf", label: "So funktioniert es" },
          { href: "/#viola", label: "Viola" },
          { href: "/#preise", label: "Mitgliedschaft" },
          { href: "/gruendungsmitglied", label: "Gründungsmitglieder" },
        ],
      },
      {
        title: "Rechtliches",
        links: [
          { href: "/impressum", label: "Impressum (Entwurf)" },
          { href: "/datenschutz", label: "Datenschutz (Entwurf)" },
        ],
      },
    ],
    help: {
      title: "Auf dem Heimweg",
      text: "Heimwegtelefon",
      number: settings["safety.heimwegtelefon_number"],
      hours: settings["safety.heimwegtelefon_hours"],
      emergency: `Im Notfall: ${settings["safety.emergency_number"]}`,
    },
    facts: ["Keine Cookies", "Keine Drittanbieter", "Server in Frankfurt"],
    copyright: `© ${new Date().getFullYear()} Fermata`,
  },
  noscript: `Für das Formular braucht diese Seite JavaScript. Ohne JavaScript erreichen Sie uns per E-Mail an ${settings["site.contact_email"]}.`,
};

/** Telefonnummer für tel:-Links (deutsche Schreibweise → +49…). */
export function telHref(number: string): string {
  const digits = number.replace(/[^0-9+]/g, "");
  return `tel:${digits.startsWith("0") && digits.length > 4 ? "+49" + digits.slice(1) : digits}`;
}
