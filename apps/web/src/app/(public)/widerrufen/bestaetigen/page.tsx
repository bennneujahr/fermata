// Öffentliche Seite aus der Mail (ohne Anmeldung): /widerrufen/bestaetigen#t=<Schlüssel>.
// Zeigt den Vertrag; erst der Knopf bestätigt die Widerruf (POST confirm_link).
import type { Metadata } from "next";
import { ContractLinkConfirm } from "@/components/mitgliedschaft/ContractLinkConfirm";
import { contractLink } from "@/copy/mitgliedschaft";

export const metadata: Metadata = {
  title: contractLink.withdraw.title,
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

export default function ConfirmPage() {
  return <ContractLinkConfirm kind="withdraw" />;
}
