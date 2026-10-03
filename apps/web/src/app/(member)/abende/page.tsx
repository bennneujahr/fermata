import type { Metadata } from "next";
import { EmptyState, PageHeader } from "@/components/ui";
import { placeholders } from "@/copy/member";
import { requireMember } from "@/lib/data";
import { titles } from "@/copy/titles";

export const metadata: Metadata = { title: titles.abende };

// Platzhalter für M5 (Vorschläge, Terminabstimmung, Abende, Rückmeldung).
export default async function EveningsPage() {
  const { form } = await requireMember("/abende");
  const c = placeholders(form).abende;
  return (
    <div className="stack stack-lg">
      <PageHeader title={c.title} lead={c.lead} />
      <EmptyState title={c.emptyTitle}>
        <p>{c.emptyText}</p>
      </EmptyState>
    </div>
  );
}
