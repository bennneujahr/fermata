// Check-in nach Beginn des Abends (Link aus Mitteilung und Mail): „Alles gut“, „Ich bin unsicher“, „Ich brauche Hilfe“.
// Bei „Hilfe“ stehen die Notrufnummern sofort groß da (tel:-Link und Nummer als Text).
import type { Metadata } from "next";
import { CheckinChoices } from "@/components/sicherheit/CheckinChoices";
import { PoliceCall } from "@/components/sicherheit/HelpNumbers";
import { EmptyState, PageHeader } from "@/components/ui";
import { checkin as checkinCopy, titles } from "@/copy/sicherheit";
import { requireMember } from "@/lib/data";
import { eveningLabel } from "@/lib/datetime";
import { getEvening, getHelpContacts } from "@/lib/safety";

export const metadata: Metadata = { title: titles.checkin };

export default async function CheckinPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { form } = await requireMember(`/abende/${id}/checkin`);
  const c = checkinCopy(form);
  const [evening, contacts] = await Promise.all([getEvening(id), getHelpContacts()]);
  if (!evening) {
    return (
      <div className="stack stack-lg">
        <EmptyState title={c.notFoundTitle}>
          <p>{c.notFoundText}</p>
        </EmptyState>
        <PoliceCall contacts={contacts} form={form} />
      </div>
    );
  }
  return (
    <div className="stack stack-lg">
      <PageHeader eyebrow={eveningLabel(evening.starts_at, evening.venue?.name)} title={c.title} lead={c.lead(evening.venue?.name ?? null)} />
      <CheckinChoices eveningId={evening.evening_id} form={form} contacts={contacts} />
    </div>
  );
}
