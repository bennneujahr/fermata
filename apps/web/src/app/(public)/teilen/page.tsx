// Öffentliche Seite „Abend teilen“ für die Vertrauensperson: /teilen#t=<Schlüssel>.
// Ohne Anmeldung, nicht in Suchmaschinen, ohne Referrer. Der Schlüssel steht im Fragment und erreicht keinen Server
// über die Adresse; die Seite lädt die Ansicht per Server Action (trust-view, JSON).
import type { Metadata } from "next";
import { TrustViewClient } from "@/components/sicherheit/TrustViewClient";
import { titles } from "@/copy/sicherheit";

export const metadata: Metadata = {
  title: titles.geteilt,
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

export default function SharedEveningPage() {
  return <TrustViewClient />;
}
