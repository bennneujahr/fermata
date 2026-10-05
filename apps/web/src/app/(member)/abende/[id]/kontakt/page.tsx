import type { Metadata } from "next";
import Link from "next/link";
import "@/styles/gespraech-abende.css";
import { ContactResult } from "@/components/abende/ContactResult";
import { ButtonLink, EmptyState, PageHeader } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { abende } from "@/copy/abende";
import { titles } from "@/copy/titles";
import { requireMember } from "@/lib/data";
import { eveningLinks } from "@/lib/evening-links";
import { getContactShare, getEveningDetail } from "@/lib/evenings";

export const metadata: Metadata = { title: titles.abende };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Kontakttausch (Link aus der Mail „Sie haben beide Ja gesagt“). Zeigt nur, was freigegeben ist.
export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { form } = await requireMember(`/abende/${id}/kontakt`);
  const c = abende(form);
  const d = UUID.test(id) ? await getEveningDetail(id) : null;
  const share = d ? await getContactShare(id) : null;
  const links = eveningLinks(id);
  return (
    <div className="stack stack-lg">
      <p>
        <Link href={d ? links.detail : "/abende"} className="cluster back-link">
          <Icon name="arrowLeft" size={18} />
          {d ? c.withName(d.counterpart_first_name) : c.back}
        </Link>
      </p>
      <PageHeader title={c.contactTitle} />
      {d && share ? (
        <ContactResult share={share} form={form} name={d.counterpart_first_name} />
      ) : (
        <EmptyState title={c.notFoundTitle} action={<ButtonLink href="/abende" variant="secondary">{c.back}</ButtonLink>}>
          <p>{c.notFoundText}</p>
        </EmptyState>
      )}
    </div>
  );
}
