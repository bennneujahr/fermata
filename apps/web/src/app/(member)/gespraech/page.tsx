import type { Metadata } from "next";
import Link from "next/link";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { placeholders } from "@/copy/member";
import { requireMember } from "@/lib/data";
import { Atem } from "./Atem";
import { titles } from "@/copy/titles";

export const metadata: Metadata = { title: titles.gespraech };

// Platzhalter für M3 (Viola). Welle 2 ersetzt den Inhalt; Navigation und Rahmen bleiben.
export default async function ConversationPage() {
  const { form } = await requireMember("/gespraech");
  const c = placeholders(form).gespraech;
  return (
    <div className="stack stack-lg">
      <PageHeader eyebrow={c.eyebrow} title={c.title} lead={c.lead} />
      <Card variant="night">
        <div className="stack" data-atem-stage>
          <Atem label={c.atemLabel} />
          <EmptyState title={c.emptyTitle}>
            <p>{c.emptyText}</p>
          </EmptyState>
        </div>
      </Card>
      <Card variant="sunk">
        <ul className="list-check list-plain stack stack-sm">
          {c.facts.map((f) => (
            <li key={f}>
              <Icon name="check" size={18} />
              <span>{f}</span>
            </li>
          ))}
        </ul>
        <p>
          <Link href="/rechtliches/ki_hinweis">{c.aiNote}</Link>
        </p>
      </Card>
    </div>
  );
}
