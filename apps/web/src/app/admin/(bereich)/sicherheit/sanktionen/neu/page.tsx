import type { Metadata } from "next";
import Link from "next/link";
import { rpc } from "@/app/admin/_lib/rpc";
import { ImposeSanctionForm } from "@/components/admin/SanctionForms";
import { Card, Notice, PageHeader } from "@/components/ui";
import { adminSafety } from "@/copy/admin-sicherheit";

const c = adminSafety.sanction;
export const metadata: Metadata = { title: c.newTitle };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function NewSanctionPage({ searchParams }: { searchParams: Promise<{ person?: string }> }) {
  const { person } = await searchParams;
  const valid = person && UUID.test(person) ? person : null;
  const acc = valid ? (await rpc<{ email: string; facts: { first_name: string; last_name: string } | null }>("admin_account", { p_user: valid })).data : null;
  const name = acc ? [acc.facts?.first_name, acc.facts?.last_name].filter(Boolean).join(" ") || acc.email : null;
  return (
    <>
      <PageHeader title={c.newTitle} lead={c.newLead} />
      {valid && acc ? (
        <Card>
          <p className="soft">
            {c.for("")}
            <Link href={`/admin/konten/${valid}`}>{name}</Link>
          </p>
          <ImposeSanctionForm userId={valid} />
        </Card>
      ) : (
        <Notice tone="info">{c.personMissing}</Notice>
      )}
    </>
  );
}
