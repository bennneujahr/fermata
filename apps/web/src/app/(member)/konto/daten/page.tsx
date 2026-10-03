import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink, Card, PageHeader } from "@/components/ui";
import { dataExport } from "@/copy/member";
import { requireMember } from "@/lib/data";

export const metadata: Metadata = { title: "Daten herunterladen" };

export default async function DataPage() {
  const { form } = await requireMember("/konto/daten");
  const c = dataExport(form);
  return (
    <div className="stack stack-lg">
      <p>
        <Link href="/konto">Konto</Link>
      </p>
      <PageHeader title={c.title} lead={c.lead} />
      <Card>
        <p className="soft">{c.format}</p>
        <div>
          <ButtonLink href="/konto/daten/export" icon="download" download>
            {c.cta}
          </ButtonLink>
        </div>
      </Card>
    </div>
  );
}
