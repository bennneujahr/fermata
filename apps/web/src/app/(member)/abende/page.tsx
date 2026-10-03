import type { Metadata } from "next";
import "@/styles/gespraech-abende.css";
import { EveningCard } from "@/components/abende/EveningCard";
import { ButtonLink, Card, EmptyState, PageHeader } from "@/components/ui";
import { abende } from "@/copy/abende";
import { titles } from "@/copy/titles";
import { zeiten } from "@/copy/zeiten";
import { formatDeadline } from "@/lib/berlin";
import { requireMember } from "@/lib/data";
import { availabilityLink } from "@/lib/evening-links";
import { isUpcoming } from "@/lib/evening-types";
import { getDbNow, getMyEvenings, getPeriods } from "@/lib/evenings";

export const metadata: Metadata = { title: titles.abende };

export default async function EveningsPage() {
  const [{ form }, evenings, periods, now] = await Promise.all([requireMember("/abende"), getMyEvenings(), getPeriods(), getDbNow()]);
  const c = abende(form);
  const z = zeiten(form);
  // Erst, was jetzt zu tun ist; dann nach Datum (nächster Abend zuerst).
  const urgent = new Set(["find", "answer_time", "choose_time", "feedback"]);
  const when = (e: (typeof evenings)[number]) => new Date(e.starts_at ?? e.my_deadline_at ?? e.created_at).getTime();
  const upcoming = evenings
    .filter((e) => isUpcoming(e, now))
    .sort((x, y) => Number(urgent.has(y.my_action)) - Number(urgent.has(x.my_action)) || when(x) - when(y));
  const past = evenings.filter((e) => !isUpcoming(e, now));
  const openPeriod = periods.find((p) => p.is_open);

  return (
    <div className="stack stack-lg">
      <PageHeader title={c.title} lead={c.lead} />

      {openPeriod ? (
        <Card
          id="freie-abende"
          variant={openPeriod.window_count ? "outline" : "accent"}
          title={z.title}
          footer={
            <ButtonLink href={availabilityLink(openPeriod.period_id)} variant={openPeriod.window_count ? "secondary" : "primary"} iconAfter="arrowRight">
              {c.toAvailability}
            </ButtonLink>
          }
        >
          <p className="soft">{openPeriod.window_count ? z.windowsCount(openPeriod.window_count) : z.lead}</p>
          <p className="muted text-sm">{z.deadline(formatDeadline(openPeriod.answer_until, now))}</p>
        </Card>
      ) : null}

      <section className="stack" aria-labelledby="kommende">
        <h2 id="kommende">{c.upcomingTitle}</h2>
        {upcoming.length ? (
          <ul className="list-plain stack evening-list">
            {upcoming.map((e) => (
              <li key={e.evening_id}>
                <EveningCard evening={e} form={form} now={now} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title={c.emptyTitle}
            headingLevel={3}
            action={
              <ButtonLink href={availabilityLink(openPeriod?.period_id)} variant="secondary">
                {c.toAvailability}
              </ButtonLink>
            }
          >
            <p>{c.emptyText}</p>
          </EmptyState>
        )}
      </section>

      <section className="stack" aria-labelledby="vergangene">
        <h2 id="vergangene">{c.pastTitle}</h2>
        {past.length ? (
          <ul className="list-plain stack evening-list">
            {past.map((e) => (
              <li key={e.evening_id}>
                <EveningCard evening={e} form={form} now={now} compact />
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">{c.pastEmpty}</p>
        )}
      </section>
    </div>
  );
}
