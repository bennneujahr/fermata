// Kündigungsknopf ohne Anmeldung (§ 312k BGB): ständig verfügbar, verlinkt im Fuß jeder Seite.
// Angemeldet geht es direkt zur vorausgefüllten Fassung unter /mitgliedschaft/kuendigen.
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PublicContractForm } from "@/components/mitgliedschaft/PublicContractForm";
import { Notice, PageHeader } from "@/components/ui";
import { cancel as cancelCopy, cancelPublic, titles } from "@/copy/mitgliedschaft";
import { getSession } from "@/lib/data";

export const metadata: Metadata = { title: titles.cancel };

export default async function PublicCancelPage() {
  const { claims } = await getSession();
  if (claims?.sub) redirect("/mitgliedschaft/kuendigen");
  return (
    <div className="stack stack-lg">
      <PageHeader title={cancelPublic.title} lead={cancelPublic.lead} />
      <Notice tone="draft">{cancelCopy("sie").draft}</Notice>
      <p className="soft">
        {cancelPublic.loginHint} <Link href="/anmelden?weiter=%2Fmitgliedschaft%2Fkuendigen">{cancelPublic.login}</Link>
      </p>
      <PublicContractForm kind="cancel" />
    </div>
  );
}
