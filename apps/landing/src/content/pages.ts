// Texte der Unterseiten (Bestätigung, Willkommen, Abmeldung, Gründungsmitglied, 404).
import { settings } from "../settings";

const bonus = settings["waitlist.bonus_places"];
const founding = settings["waitlist.founding_limit"];

export const bestaetigen = {
  title: "Bitte schauen Sie in Ihr Postfach",
  eyebrow: "Fast geschafft",
  heading: "Bitte bestätigen Sie Ihre Adresse.",
  lead: "Sie bekommen in den nächsten Minuten eine E-Mail von Fermata. Klicken Sie darin auf „Anmeldung bestätigen“. Erst dann bekommen Sie Ihren Platz.",
  tipsTitle: "Keine E-Mail da?",
  tips: [
    "Schauen Sie im Werbe- oder Spam-Ordner nach.",
    "Der Link in der E-Mail gilt 72 Stunden.",
    "Nach zehn Minuten können Sie sich erneut eintragen. Dann schicken wir den Link noch einmal.",
  ],
  back: { href: "/", label: "Zur Startseite" },
};

export const willkommen = {
  title: "Ihr Platz auf der Warteliste",
  loading: "Einen Moment, wir holen Ihren Platz …",
  noscript: "Diese Seite braucht JavaScript, um Ihren Platz anzuzeigen. Ihren Platz finden Sie auch in der Willkommens-Mail.",
  missing: {
    heading: "Dieser Link gilt nicht mehr.",
    text: "Vielleicht haben Sie inzwischen einen neueren Link per E-Mail bekommen. Wenn Sie sich erneut eintragen, schicken wir Ihnen einen neuen Link zu Ihrem Platz.",
    cta: { href: "/#warteliste", label: "Neuen Link anfordern" },
  },
  error: "Ihr Platz konnte gerade nicht geladen werden. Bitte laden Sie die Seite in ein paar Minuten neu.",
  eyebrow: "Willkommen",
  greeting: "Willkommen, {name}.",
  placeLabel: "Ihr Platz",
  regionPrefix: "auf der Warteliste für",
  regions: {
    westmecklenburg: "Westmecklenburg",
    hamburg: "Hamburg",
    luebeck: "Lübeck",
    rostock: "Rostock",
    anderswo: "weitere Regionen",
  } as Record<string, string>,
  placeNote: "Ihr Platz kann sich noch etwas verschieben, wenn andere Menschen jemanden einladen.",
  bonusNote: `Sie sind schon {n}-mal um ${bonus} Plätze vorgerückt.`,
  bonusNoteOne: `Sie sind schon ${bonus} Plätze vorgerückt.`,
  founding: {
    label: "Gründungsmitglied",
    text: `Sie gehören zu den ersten ${founding} aus Westmecklenburg.`,
    link: { href: "/gruendungsmitglied", label: "Was das heißt" },
  },
  invite: {
    title: "Laden Sie eine Person ein",
    text: `Wenn sie sich über Ihren Link einträgt und bestätigt, rücken Sie beide ${bonus} Plätze vor.`,
    label: "Ihr persönlicher Einladungslink",
    copy: "Link kopieren",
    copied: "Der Link ist kopiert.",
    copyFailed: "Kopieren hat nicht geklappt. Bitte markieren Sie den Link und kopieren Sie ihn selbst.",
    used: `Ihre Einladung wurde genutzt. Sie und die eingeladene Person sind ${bonus} Plätze vorgerückt.`,
    none: "Für Sie ist gerade keine Einladung frei.",
  },
  nextTitle: "Wie es weitergeht",
  next: [
    "Wenn Fermata in Ihrer Region beginnt, bekommen Sie eine persönliche Einladung per E-Mail.",
    "Bis dahin schreiben wir Ihnen nur, wenn es Neues zum Start gibt.",
    "Diese Seite können Sie jederzeit wieder öffnen: über den Link in Ihrer Willkommens-Mail.",
  ],
  unsubscribe: "Von der Warteliste abmelden",
};

export const abmelden = {
  title: "Von der Warteliste abmelden",
  heading: "Möchten Sie sich abmelden?",
  text: "Wenn Sie sich abmelden, löschen wir Ihren Eintrag vollständig: Vorname, E-Mail-Adresse, Region, Postleitzahl und Platz. Ihr Einladungslink gilt dann nicht mehr. Das lässt sich nicht rückgängig machen.",
  confirm: "Ja, abmelden und löschen",
  working: "Wird gelöscht …",
  cancel: { href: "/", label: "Nein, auf der Liste bleiben" },
  missing: "Dieser Abmeldelink ist unvollständig. Bitte nutzen Sie den Link aus Ihrer E-Mail.",
  error: "Die Abmeldung hat gerade nicht geklappt. Bitte versuchen Sie es in ein paar Minuten noch einmal.",
  noscript: `Die Abmeldung braucht JavaScript. Sie können uns auch schreiben: ${settings["site.contact_email"]}.`,
};

export const abgemeldet = {
  title: "Abgemeldet",
  heading: "Sie sind abgemeldet.",
  text: "Ihr Eintrag ist gelöscht, und wir schreiben Ihnen nicht mehr. Wenn Sie es sich anders überlegen, können Sie sich jederzeit neu eintragen.",
  cta: { href: "/#warteliste", label: "Neu eintragen" },
  back: { href: "/", label: "Zur Startseite" },
};

export const abgelaufen = {
  title: "Link abgelaufen",
  heading: "Dieser Link gilt nicht mehr.",
  text: "Bestätigungslinks gelten 72 Stunden und nur einmal. Wenn Sie schon bestätigt haben, finden Sie Ihren Platz über den Link in der Willkommens-Mail. Sonst tragen Sie sich einfach noch einmal ein, dann schicken wir Ihnen einen neuen Link.",
  cta: { href: "/#warteliste", label: "Noch einmal eintragen" },
};

export const gruendung = {
  title: "Gründungsmitglieder",
  eyebrow: "Gründungsmitglieder",
  heading: `Die ersten ${founding} aus Westmecklenburg.`,
  lead: `Die ersten ${founding} Menschen aus Westmecklenburg, die ihre Anmeldung bestätigen, werden Gründungsmitglieder von Fermata.`,
  sections: [
    {
      title: "Wer dazugehört",
      paragraphs: [
        "Zu Westmecklenburg zählen Schwerin, Wismar und die Landkreise Nordwestmecklenburg und Ludwigslust-Parchim, so wie Sie es im Formular auswählen.",
        "Es zählt die Reihenfolge der Bestätigungen, nicht der angezeigte Platz. Wer durch Einladungen vorrückt, wird dadurch nicht nachträglich Gründungsmitglied, und niemand verliert den Status, weil andere vorrücken.",
        "Der Status wird bei der Bestätigung einmal festgelegt und bleibt. Er ist persönlich und lässt sich nicht übertragen. Wer sich abmeldet, gibt ihn auf.",
      ],
    },
    {
      title: "Was es bedeutet",
      paragraphs: [
        "Mit dem Status ist zurzeit kein besonderer Vorteil verbunden, und wir versprechen keinen. Gründungsmitglieder sind die Menschen, mit denen Fermata beginnt.",
        "Sollte sich daran etwas ändern, steht es auf dieser Seite, und Gründungsmitglieder bekommen eine E-Mail.",
      ],
    },
    {
      title: "Wie Sie es sehen",
      paragraphs: ["Ob Sie dazugehören, steht in Ihrer Willkommens-Mail und auf Ihrer persönlichen Seite mit Ihrem Platz."],
    },
  ],
  cta: { href: "/#warteliste", label: "Auf die Warteliste" },
};

export const notFound = {
  title: "Seite nicht gefunden",
  eyebrow: "404",
  heading: "Eine Pause an der falschen Stelle.",
  text: "Diese Seite gibt es nicht oder nicht mehr. Vielleicht hilft die Startseite weiter.",
  cta: { href: "/", label: "Zur Startseite" },
};

/** Nur im Vorschau-Build (PUBLIC_PREVIEW=1) sichtbar. */
export const vorschau = {
  banner: "Vorschau zum Ansehen. Das Formular sendet nichts, die Willkommensseite zeigt Beispieldaten.",
  openConfirm: "Vorschau: so geht es nach dem Klick auf den Bestätigungslink weiter",
};
