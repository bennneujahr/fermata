// Widerrufsbutton ohne Anmeldung (§ 356a BGB): verlinkt im Fuß jeder Seite.
// Angemeldet geht es direkt zur vorausgefüllten Fassung unter /mitgliedschaft/widerrufen.
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PublicContractForm } from "@/components/mitgliedschaft/PublicContractForm";
import { Notice, PageHeader } from "@/components/ui";
import { titles, withdraw as withdrawCopy, withdrawPublic } from "@/copy/mitgliedschaft";
import { footerLinks } from "@/copy/rechtliches";
import { getSession } from "@/lib/data";

export const metadata: Metadata = { title: titles.withdraw };

export default async function PublicWithdrawPage() {
  const { claims } = await getSession();
  if (claims?.sub) redirect("/mitgliedschaft/widerrufen");
  return (
    <div className="stack stack-lg">
      <PageHeader title={withdrawPublic.title} lead={withdrawPublic.lead} />
      <Notice tone="draft">{withdrawCopy("sie").draft}</Notice>
      <p className="soft">
        {withdrawPublic.loginHint} <Link href="/anmelden?weiter=%2Fmitgliedschaft%2Fwiderrufen">{withdrawPublic.login}</Link>
      </p>
      <PublicContractForm kind="withdraw" />
      <p className="text-sm">
        <Link href="/rechtliches/widerruf">{footerLinks.withdrawalPolicy}</Link>
      </p>
    </div>
  );
}
