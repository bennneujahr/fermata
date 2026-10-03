// Installieren (PLAN 5.2) und Offline-Seite. Hilfe und Sicherheit: copy/sicherheit.ts, Rechtliches: copy/rechtliches.ts.

export const install = {
  title: "Fermata als App",
  lead: "Auf dem Home-Bildschirm öffnet sich Fermata wie eine App – und auf dem iPhone kommen Erinnerungen nur so an.",
  iosTitle: "iPhone und iPad (Safari)",
  ios: [
    "Öffnen Sie Fermata in Safari.",
    "Tippen Sie unten auf „Teilen“ (das Quadrat mit dem Pfeil nach oben).",
    "Wählen Sie „Zum Home-Bildschirm“ und tippen Sie auf „Hinzufügen“.",
    "Öffnen Sie Fermata ab jetzt über das neue Symbol und melden Sie sich dort einmal mit Ihrem Code an.",
  ],
  iosNote: "Wichtig: Die installierte App hat eine eigene Anmeldung. Ein Link aus der Mail öffnet Safari – geben Sie in der App deshalb den sechsstelligen Code ein.",
  androidTitle: "Android (Chrome)",
  android: [
    "Öffnen Sie Fermata in Chrome.",
    "Tippen Sie oben rechts auf das Menü (drei Punkte).",
    "Wählen Sie „App installieren“ oder „Zum Startbildschirm hinzufügen“.",
  ],
  desktopTitle: "Computer",
  desktop: "In Chrome und Edge zeigt die Adresszeile ein Symbol zum Installieren. Nötig ist das nicht – Fermata funktioniert auch im Browser.",
  installed: "Fermata läuft gerade als installierte App.",
};

export const offline = {
  title: "Keine Verbindung",
  lead: "Fermata braucht gerade das Internet. Sobald die Verbindung zurück ist, geht es hier weiter.",
  emergency: "Im Notfall: 110",
  retry: "Neu laden",
};
