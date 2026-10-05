// Öffentliche Seite aus der Mail (ohne Anmeldung): /kuendigen/bestaetigen#t=<Schlüssel>.
// Zeigt den Vertrag; erst der Knopf bestätigt die Kündigung (POST confirm_link).
import type { Metadata } from "next";
import { ContractLinkConfirm } from "@/components/mitgliedschaft/ContractLinkConfirm";
import { contractLink } from "@/copy/mitgliedschaft";

export const metadata: Metadata = {
  title: contractLink.cancel.title,
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

export default function ConfirmPage() {
  return <ContractLinkConfirm kind="cancel" />;
}
