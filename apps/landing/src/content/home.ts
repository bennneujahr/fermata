// Texte der Startseite. Ruhiger Ton, Sie-Form, keine Ausrufezeichen, keine Versprechen (scripts/tone-rules.json).
import { euro, settings } from "../settings";

const bonus = settings["waitlist.bonus_places"];
const founding = settings["waitlist.founding_limit"];
const tiers = settings["billing.tiers"];
const pricesMode = settings["landing.prices_mode"];
const startMonth = settings["site.start_month"];

export const hero = {
  eyebrow: "Zuerst in Westmecklenburg",
  titleLead: "Weniger Profile.",
  titleEm: "Ein echter Abend.",
  lead:
    "Fermata ist Dating ohne Wischen, ohne Feed und ohne Chatten vorab. Sie sprechen einmal in Ruhe mit Viola. Alle 14 Tage bekommen Sie einen Vorschlag, den ein Mensch geprüft hat, und einen Tisch in einem Lokal möglichst in der Mitte.",
  primary: { href: "#warteliste", label: "Auf die Warteliste" },
  secondary: { href: "#ablauf", label: "So funktioniert es" },
  note: "Kostenlos bis einschließlich zum ersten Abend. Ohne Karte.",
  card: {
    label: "Beispiel",
    caption: "So sieht ein Vorschlag aus (Beispiel).",
    kicker: "Ihr Vorschlag",
    day: "Donnerstag",
    time: "19:30 Uhr",
    placeLabel: "Ort",
    place: "Ein Partner-Lokal in Wismar",
    placeNote: "für Sie beide etwa 25 Minuten entfernt",
    whyLabel: "Warum Sie beide",
    why: "Sie lesen beide gern, gehen lieber spazieren als ins Fitnessstudio und möchten sich Zeit lassen.",
    deadline: "Uhrzeit bestätigen bis Freitag, 12 Uhr",
    checked: "Von einem Menschen geprüft",
  },
};

export const principles = [
  { title: "Ohne Wischen", text: "Keine Stapel von Gesichtern. Ein Vorschlag, der zu Ihnen passen könnte." },
  { title: "Ohne Feed", text: "Nichts, das Sie abends noch einmal öffnen müssen. Fermata meldet sich, wenn es etwas gibt." },
  { title: "Ohne Chatten vorab", text: "Die Uhrzeit stimmen Sie über feste Fristen ab. Alles andere erzählen Sie sich am Tisch." },
];

export const steps = {
  id: "ablauf",
  eyebrow: "Der Ablauf",
  title: "Vom Eintrag bis zum ersten Abend",
  intro: "Sieben Schritte, ohne Eile. Sie wissen immer, was als Nächstes kommt, und nichts passiert ohne Ihr Ja.",
  items: [
    {
      title: "Warteliste",
      text: `Sie tragen sich ein und bestätigen Ihre Adresse. Sie bekommen einen Platz und einen persönlichen Link. Kommt jemand über Ihren Link dazu, rücken Sie beide ${bonus} Plätze vor.`,
    },
    {
      title: "Persönliche Einladung",
      text: "Wenn Fermata in Ihrer Region beginnt, laden wir Sie per E-Mail ein. Der Reihe nach, nach Ihrem Platz.",
    },
    {
      title: "Konto und Ausweisprüfung",
      text: "Sie legen ein Konto an und zeigen einmal Ihren Ausweis. So treffen Sie nur echte, volljährige Menschen.",
    },
    {
      title: "Gespräch mit Viola",
      text: "Viola ist eine KI-Stimme ohne Gesicht und sagt das auch. Sie fragt nach dem, was Ihnen wichtig ist. Am Ende lesen Sie eine Zusammenfassung und geben sie frei.",
    },
    {
      title: "Alle 14 Tage ein Vorschlag",
      text: "Aus den Gesprächen entsteht ein Vorschlag für einen Menschen, der zu Ihnen passen könnte. Bevor Sie ihn bekommen, prüft ihn ein Mensch.",
    },
    {
      title: "Ein Abend im Partner-Lokal",
      text: "Das Lokal liegt möglichst in der Mitte zwischen Ihnen beiden. Die Uhrzeit stimmen Sie über feste Fristen ab: Wunschzeit nennen, bestätigen, fertig.",
    },
    {
      title: "Rückmeldung am nächsten Tag",
      text: "Am Tag danach fragen wir kurz, wie es war. Ihre Kontaktdaten tauschen Sie nur aus, wenn Sie beide Ja sagen.",
    },
  ],
};

export const viola = {
  id: "viola",
  eyebrow: "Viola",
  title: "Eine Stimme, die zuhört. Klar als KI benannt.",
  lead:
    "Viola ist eine künstliche Intelligenz. Sie hat kein Gesicht und gibt sich nie als Mensch aus. Im Gespräch fragt sie nach Ihrer Persönlichkeit, Ihren Werten und Wünschen, nach Ihren Lebensumständen, wie weit Sie fahren mögen und wann Sie Zeit haben.",
  atemLabel: "Viola ist bereit.",
  atemCaption: "So erscheint Viola: ein ruhiges Atmen, kein Gesicht.",
  facts: [
    { title: "Keine Aufnahme", text: "Ihre Stimme wird nicht gespeichert. Es bleibt nur der Text des Gesprächs, und der wird nach 30 Tagen gelöscht." },
    { title: "Sie haben das letzte Wort", text: "Aus dem Gespräch entsteht eine Zusammenfassung. Sie lesen sie, korrigieren sie und geben sie frei." },
    { title: "Lieber schreiben", text: "Wenn Ihnen Sprechen nicht liegt, führen Sie das Gespräch als Text." },
  ],
  hoerprobe: {
    title: "Hörprobe",
    text: "So klingt Viola. Die Aufnahme ist ein Beispiel und dauert etwa 30 Sekunden.",
    transcriptLabel: "Text der Hörprobe",
    transcript:
      "Guten Abend. Ich bin Viola, eine künstliche Intelligenz. Ich möchte Sie ein wenig kennenlernen, damit Fermata einen Abend für Sie finden kann. Sie können jederzeit eine Pause machen.",
  },
};

export const safety = {
  id: "sicherheit",
  eyebrow: "Sicherheit",
  title: "Sicher ankommen, sicher nach Hause.",
  intro: "Fermata verabredet Abende nur an öffentlichen Orten. Dazu kommen ein paar klare Regeln, die für alle gelten.",
  items: [
    {
      icon: "ausweis",
      title: "Ausweisprüfung für alle",
      text: "Jede Person zeigt vor dem ersten Gespräch ihren Ausweis. Wir behalten davon nur das Nötige: volljährig oder nicht, und ob Name und Geburtsdatum passen.",
    },
    {
      icon: "melden",
      title: "Melden, überall",
      text: "Auf jeder Seite gibt es einen Knopf zum Melden. Ein Mensch sieht sich jede Meldung an, in der Regel innerhalb von 24 Stunden.",
    },
    {
      icon: "hilfe",
      title: "Hilfe-Knopf am Abend",
      text: "Während des Abends haben Sie einen Hilfe-Knopf. Auf Wunsch fragen wir nach 30 Minuten kurz nach, ob alles in Ordnung ist.",
    },
    {
      icon: "ort",
      title: "Nur öffentliche Orte",
      text: "Der Abend findet in einem Partner-Lokal statt, nie zu Hause. Ort und Uhrzeit können Sie mit einer Vertrauensperson teilen.",
    },
  ],
  heimweg: {
    title: "Auf dem Heimweg nicht allein",
    text: "Das Heimwegtelefon begleitet Sie am Telefon, bis Sie gut zu Hause sind. Ein unabhängiges, ehrenamtliches Angebot zum normalen Festnetztarif.",
    number: settings["safety.heimwegtelefon_number"],
    hours: settings["safety.heimwegtelefon_hours"],
    emergency: `Im Notfall rufen Sie bitte die ${settings["safety.emergency_number"]}.`,
  },
};

export const privacy = {
  id: "daten",
  eyebrow: "Ihre Daten",
  title: "Datenschutz, der nicht im Kleingedruckten steht.",
  intro: "Wir erheben so wenig wie möglich und sagen klar, wo es liegt und wann es gelöscht wird.",
  items: [
    { title: "Server in Frankfurt", text: "Datenbank und Funktionen laufen bei Supabase in Frankfurt am Main, in der EU." },
    { title: "Keine Aufnahme Ihrer Stimme", text: "Das Gespräch mit Viola wird nicht aufgezeichnet. Rohaudio speichern wir nirgends." },
    { title: "Transkripte nach 30 Tagen gelöscht", text: "Den Text des Gesprächs löschen wir automatisch nach 30 Tagen." },
    { title: "Keine Cookies", text: "Diese Seite setzt keine Cookies. Deshalb gibt es hier auch keinen Cookie-Hinweis." },
    { title: "Keine Drittanbieter", text: "Schriften und Bilder kommen von unserem eigenen Server. Keine Analyse-Werkzeuge, keine Werbenetzwerke." },
    { title: "Ihr Gegenüber sieht wenig", text: "Aus Ihrem Gespräch erfährt Ihr Gegenüber nur, warum Sie beide passen könnten." },
  ],
  link: { href: "/datenschutz", label: "Zur Datenschutzerklärung (Entwurf)" },
};

const vatNote =
  settings["landing.vat_mode"] === "kleinunternehmer"
    ? "Gemäß § 19 UStG wird keine Umsatzsteuer berechnet."
    : "Alle Preise inklusive 19 % Umsatzsteuer.";

export const prices = {
  id: "preise",
  eyebrow: "Mitgliedschaft",
  title: "Der erste Abend kostet nichts.",
  intro:
    "Bis einschließlich zum ersten Abend zahlen Sie nichts und hinterlegen keine Karte. Danach entscheiden Sie, ob und wie Sie weitermachen.",
  mode: pricesMode,
  badge: pricesMode === "geplant" ? "Preise geplant · Stand Oktober 2026" : null,
  period: "je 4 Wochen",
  tiers: [
    { key: "auftakt", tier: tiers.auftakt, motto: "Der erste Takt", text: "Ein Abend in vier Wochen, ganz in Ihrem Tempo." },
    { key: "andante", tier: tiers.andante, motto: "In ruhigem Schritt", text: "Zwei Abende in vier Wochen, mit etwas Abstand dazwischen." },
    { key: "loge", tier: tiers.loge, motto: "Der Platz mit Blick", text: "Vier Abende in vier Wochen, wenn Sie gerade Zeit und Lust haben." },
  ].map((t) => ({
    ...t,
    price: euro(t.tier.price_cents),
    evenings: t.tier.evenings === 1 ? "1 Abend" : `${t.tier.evenings} Abende`,
  })),
  cancel: "Kündigen und Widerrufen gehen mit je einem Knopf in Ihrem Konto. Ohne Anruf, ohne Formular.",
  vat: vatNote,
  plannedNote: pricesMode === "geplant" ? "Die Preise sind geplant und können sich bis zum Start noch ändern." : null,
  offText: "Die Preise nach dem ersten Abend geben wir vor dem Start bekannt.",
};

export const region = {
  id: "region",
  eyebrow: "Region",
  title: "Zuerst Westmecklenburg.",
  text:
    "Ein guter Abend braucht kurze Wege. Deshalb beginnen wir in einer Region: in Schwerin, Wismar und den Landkreisen Nordwestmecklenburg und Ludwigslust-Parchim. Hamburg, Lübeck und Rostock können sich schon eintragen, alle anderen auch. Die Warteliste zeigt uns, wo es als Nächstes weitergeht.",
  list: [
    { name: "Westmecklenburg", status: "beginnt zuerst", active: true },
    { name: "Hamburg", status: "Warteliste offen", active: false },
    { name: "Lübeck", status: "Warteliste offen", active: false },
    { name: "Rostock", status: "Warteliste offen", active: false },
    { name: "Anderswo", status: "Warteliste offen", active: false },
  ],
  mapLabel: "Karte: Westmecklenburg mit Schwerin, Wismar, Ludwigslust und Parchim; dazu Hamburg, Lübeck und Rostock.",
  founding: {
    number: String(founding),
    title: `Die ersten ${founding} aus Westmecklenburg werden Gründungs­mitglieder.`,
    text: "Es zählt die Reihenfolge der Bestätigungen. Einen besonderen Vorteil versprechen wir dafür nicht: Gründungsmitglieder sind die Menschen, mit denen Fermata beginnt.",
    link: { href: "/gruendungsmitglied", label: "Wer dazugehört" },
  },
};

const priceAnswer =
  pricesMode === "aus"
    ? "Bis einschließlich zum ersten Abend nichts, und Sie hinterlegen keine Karte. Die Preise danach geben wir vor dem Start bekannt."
    : `Bis einschließlich zum ersten Abend nichts, und Sie hinterlegen keine Karte. Danach gibt es drei Stufen für je 4 Wochen: ${tiers.auftakt.name} für ${euro(tiers.auftakt.price_cents)} mit einem Abend, ${tiers.andante.name} für ${euro(tiers.andante.price_cents)} mit zwei Abenden und ${tiers.loge.name} für ${euro(tiers.loge.price_cents)} mit vier Abenden.${pricesMode === "geplant" ? " Die Preise sind geplant." : ""}`;

export const faq = {
  id: "fragen",
  eyebrow: "Fragen",
  title: "Was Menschen uns oft fragen",
  intro: "Und wenn Ihre Frage fehlt: Schreiben Sie uns.",
  contact: settings["site.contact_email"],
  items: [
    {
      q: "Was ist bei Fermata anders?",
      a: "Es gibt kein Wischen, keinen Feed und kein Chatten vorab. Statt vieler Profile bekommen Sie alle 14 Tage einen Vorschlag, den ein Mensch geprüft hat, und einen Abend in einem Lokal. Fermata nimmt sich die Zeit, die Kennenlernen braucht.",
    },
    {
      q: "Wer ist Viola?",
      a: "Viola ist eine KI-Stimme. Sie führt das Kennenlerngespräch mit Ihnen, hat kein Gesicht und sagt zu Beginn jedes Gesprächs, dass sie eine KI ist. Über Vorschläge entscheidet sie nicht allein: Jeder Vorschlag wird von einem Menschen geprüft.",
    },
    {
      q: "Was passiert mit meiner Stimme?",
      a: "Ihre Stimme wird nicht aufgezeichnet. Sie wird während des Gesprächs in Text umgewandelt, und dieser Text wird nach 30 Tagen gelöscht. Was bleibt, ist die Zusammenfassung, die Sie selbst freigegeben haben.",
    },
    {
      q: "Wer sieht meine Daten?",
      a: "Ihre Angaben sehen Sie selbst und, wenn es für eine Prüfung nötig ist, das kleine Fermata-Team. Ihr Gegenüber erfährt aus Ihrem Gespräch nur, warum Sie beide passen könnten. Kontaktdaten tauschen Sie nur aus, wenn Sie beide nach dem Abend Ja sagen.",
    },
    { q: "Was kostet es?", a: priceAnswer },
    {
      q: "Was, wenn der Abend nicht passt?",
      a: "Das kommt vor, und es ist in Ordnung. Am nächsten Tag geben Sie eine kurze Rückmeldung. Ihr Gegenüber erfährt davon nichts, und Ihre Antwort hilft, den nächsten Vorschlag besser zu machen.",
    },
    {
      q: "Wie sicher ist das?",
      a: `Alle zeigen ihren Ausweis, Abende finden nur in öffentlichen Partner-Lokalen statt, und Sie können jederzeit melden, wenn etwas nicht stimmt. Während des Abends haben Sie einen Hilfe-Knopf. Für den Heimweg gibt es das Heimwegtelefon unter ${settings["safety.heimwegtelefon_number"]}.`,
    },
    {
      q: "Ab wann geht es los?",
      a: startMonth
        ? `Die ersten Abende in Westmecklenburg sind für ${startMonth} geplant. Wer auf der Warteliste steht, erfährt es zuerst.`
        : "Sobald in Westmecklenburg genug Menschen auf der Warteliste stehen und die ersten Partner-Lokale bereit sind. Wer auf der Warteliste steht, erfährt es zuerst.",
    },
    {
      q: "Warum zuerst Westmecklenburg?",
      a: "Weil ein guter Abend Nähe braucht: kurze Wege und Lokale, die wir persönlich auswählen. Wir beginnen deshalb in einer Region und wachsen von dort aus. Hamburg, Lübeck und Rostock können sich schon eintragen.",
    },
    {
      q: "Kann ich jemanden einladen?",
      a: `Ja. Nach der Bestätigung bekommen Sie einen persönlichen Link. Wenn sich die eingeladene Person einträgt und bestätigt, rücken Sie beide ${bonus} Plätze vor.`,
    },
    {
      q: "Was passiert bei einer Absage?",
      a: "Einen Vorschlag können Sie ablehnen, ohne Begründung. Einen vereinbarten Abend können Sie absagen; Ihr Gegenüber erfährt es dann sofort. Wie kurzfristige Absagen bei bezahlten Abenden angerechnet werden, legen wir vor dem Start fest und schreiben es klar in die Bedingungen.",
    },
    {
      q: "Für wen ist Fermata?",
      a: "Für Erwachsene ab 18, gleich welcher Orientierung, die lieber einen echten Abend erleben, als Profile zu sortieren.",
    },
    {
      q: "Brauche ich eine App?",
      a: "Nein. Fermata läuft im Browser auf Telefon und Computer. Auf dem Telefon können Sie die Seite wie eine App auf den Startbildschirm legen.",
    },
    {
      q: "Wie melde ich mich wieder ab?",
      a: "Mit dem Link in Ihrer Willkommens-Mail oder auf Ihrer persönlichen Seite. Ihr Eintrag wird dann vollständig gelöscht.",
    },
  ],
};

export const join = {
  id: "warteliste",
  eyebrow: "Warteliste",
  title: "Auf die Warteliste",
  intro: "Es kostet nichts und verpflichtet zu nichts. Wir schreiben Ihnen nur, wenn es um Ihren Platz oder den Start geht.",
  next: [
    "Sie bekommen eine E-Mail und bestätigen Ihre Adresse.",
    "Sie erhalten Ihren Platz und einen Link zum Einladen.",
    "Wenn Ihre Region beginnt, laden wir Sie persönlich ein.",
  ],
  nextTitle: "Was danach passiert",
};
