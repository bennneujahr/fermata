// Öffentliche Seite für Partner-Lokale: /lokal/bestaetigen#t=<Schlüssel> aus der Reservierungs-Mail.
// Zeigt Datum, Uhrzeit, Name der Reservierung, Tisch-Code und Personen; erst der Knopf bestätigt (POST an venue-confirm).
import type { Metadata } from "next";
import { VenueConfirmClient } from "@/components/sicherheit/VenueConfirmClient";
import { titles } from "@/copy/sicherheit";

export const metadata: Metadata = {
  title: titles.lokal,
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

export default function VenueConfirmPage() {
  return <VenueConfirmClient />;
}
