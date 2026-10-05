import type { Metadata } from "next";
import { redirect } from "next/navigation";
import "@/styles/gespraech-abende.css";
import { ButtonLink, EmptyState, PageHeader } from "@/components/ui";
import { titles } from "@/copy/titles";
import { zeiten } from "@/copy/zeiten";
import { requireMember } from "@/lib/data";
import { availabilityLink } from "@/lib/evening-links";
import { getPeriods } from "@/lib/evenings";

export const metadata: Metadata = { title: titles.zeiten };

// Ohne Zeitraum in der Adresse: zum offenen (sonst nächsten) Zeitraum.
export default async function AvailabilityIndex() {
  const [{ form }, periods] = await Promise.all([requireMember("/zeiten"), getPeriods()]);
  const target = periods.find((p) => p.is_open) ?? periods[0];
  if (target) redirect(availabilityLink(target.period_id));
  const c = zeiten(form);
  return (
    <div className="stack stack-lg">
      <PageHeader title={c.title} lead={c.lead} />
      <EmptyState title={c.noPeriodTitle} action={<ButtonLink href="/abende" variant="secondary">{c.back}</ButtonLink>}>
        <p>{c.noPeriodText}</p>
      </EmptyState>
    </div>
  );
}
