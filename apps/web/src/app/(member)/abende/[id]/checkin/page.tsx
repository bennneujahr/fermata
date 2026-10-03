// Check-in nach Beginn des Abends (Link aus Mitteilung und Mail): „Alles gut“, „Ich bin unsicher“, „Ich brauche Hilfe“.
// Bei „Hilfe“ stehen die Notrufnummern sofort groß da (tel:-Link und Nummer als Text).
import type { Metadata } from "next";
import { CheckinChoices } from "@/components/sicherheit/CheckinChoices";
import { PoliceCall } from "@/components/sicherheit/HelpNumbers";
import { ReportButton } from "@/components/sicherheit/ReportButton";
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
  const label = eveningLabel(evening.starts_at, evening.venue?.name);
  return (
    <div className="stack stack-lg">
      <PageHeader eyebrow={label} title={c.title} lead={c.lead(evening.venue?.name ?? null)} />
      <CheckinChoices eveningId={evening.evening_id} form={form} contacts={contacts} />
      <section className="card card--sunk stack stack-sm" aria-labelledby="checkin-melden">
        <h2 id="checkin-melden" className="card__title">
          {c.reportTitle}
        </h2>
        <p className="soft">{c.reportText}</p>
        <div>
          <ReportButton
            form={form}
            eveningId={evening.evening_id}
            eveningLabel={label}
            counterpartName={evening.counterpart_first_name}
            police={contacts.police}
          />
        </div>
      </section>
    </div>
  );
}
