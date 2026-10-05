// Anmeldung (PLAN 2.5): E-Mail mit 6-stelligem Code und Link. Vor der Anmeldung immer „Sie“.

export const login = {
  title: "Anmelden",
  lead: "Fermata funktioniert ohne Passwort. Wir schicken Ihnen einen sechsstelligen Code und einen Link per E-Mail.",
  emailLabel: "E-Mail-Adresse",
  emailHint: "Die Adresse, an die Ihre Einladung ging.",
  submit: "Code anfordern",
  sending: "Wird gesendet …",
  invalidEmail: "Bitte geben Sie eine gültige E-Mail-Adresse ein.",
  rateLimited: "Sie haben gerade schon einen Code angefordert. Bitte warten Sie eine Minute.",
  inviteOnly: "Fermata ist zurzeit nur mit persönlicher Einladung möglich. Die Warteliste finden Sie auf unserer Website.",
};

export const code = {
  title: "Code eingeben",
  lead: (email: string) => `Wenn ${email} eingeladen ist, ist jetzt ein Code unterwegs. Er gilt 15 Minuten.`,
  leadNoEmail: "Bitte geben Sie zuerst Ihre E-Mail-Adresse ein.",
  label: "Sechsstelliger Code",
  hint: "Nur Ziffern. Sie können auch den Link in der Mail öffnen.",
  submit: "Anmelden",
  checking: "Wird geprüft …",
  invalid: "Der Code stimmt nicht oder ist abgelaufen. Bitte prüfen Sie ihn oder fordern Sie einen neuen an.",
  format: "Der Code hat sechs Ziffern.",
  resend: "Neuen Code senden",
  resendWait: (s: number) => `Neuer Code in ${s} Sekunden möglich`,
  resent: "Ein neuer Code ist unterwegs.",
  otherEmail: "Andere E-Mail-Adresse verwenden",
  noMail: "Keine Mail bekommen? Schauen Sie bitte auch im Spam-Ordner nach.",
};

export const confirm = {
  title: "Anmeldung abschließen",
  lead: "Ein Klick noch, dann sind Sie angemeldet.",
  why: "Wir fragen kurz nach, damit Programme, die Links in Mails vorab öffnen, Ihren Link nicht verbrauchen.",
  submit: "Jetzt anmelden",
  checking: "Wird geprüft …",
  invalid: "Dieser Link ist abgelaufen oder wurde schon benutzt. Fordern Sie einfach einen neuen Code an.",
  toLogin: "Neuen Code anfordern",
  missing: "Dieser Link ist unvollständig.",
};

export const logout = {
  title: "Sie sind abgemeldet",
  lead: "Bis bald. Auf diesem Gerät ist jetzt niemand mehr angemeldet.",
  deletedTitle: "Ihr Konto ist gelöscht",
  deletedLead: "Wir haben Ihre Daten gelöscht und Ihnen eine Bestätigung per E-Mail geschickt. Danke, dass Sie Fermata ausprobiert haben.",
  again: "Wieder anmelden",
};

export const mfa = {
  enrolTitle: "Zwei-Faktor einrichten",
  enrolLead: "Der Admin-Bereich ist nur mit einem zweiten Faktor erreichbar. Richten Sie dafür eine Authenticator-App ein (zum Beispiel die Ihres Passwort-Managers).",
  step1: "Scannen Sie den QR-Code mit Ihrer Authenticator-App.",
  manual: "Oder geben Sie diesen Schlüssel von Hand ein:",
  qrAlt: "QR-Code für die Authenticator-App",
  step2: "Geben Sie den sechsstelligen Code aus der App ein.",
  codeLabel: "Code aus der App",
  submit: "Bestätigen",
  checking: "Wird geprüft …",
  invalid: "Der Code stimmt nicht. Codes wechseln alle 30 Sekunden.",
  preparing: "Wird vorbereitet …",
  enrolFailed: "Die Einrichtung ließ sich nicht starten. Bitte laden Sie die Seite neu.",
  challengeTitle: "Zweiter Faktor",
  challengeLead: "Bitte geben Sie den aktuellen Code aus Ihrer Authenticator-App ein.",
  noFactor: "Für dieses Konto ist noch kein zweiter Faktor eingerichtet.",
  toEnrol: "Jetzt einrichten",
};
