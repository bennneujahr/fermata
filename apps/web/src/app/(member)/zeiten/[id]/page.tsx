import type { Metadata } from "next";
import Link from "next/link";
import "@/styles/gespraech-abende.css";
import { AvailabilityGrid } from "@/components/abende/AvailabilityGrid";
import { Badge, Card, EmptyState, Notice, PageHeader } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { titles } from "@/copy/titles";
import { zeiten } from "@/copy/zeiten";
import { periodDays, windowsOutsideGrid, windowsToCells } from "@/lib/availability";
import { formatDateKeyLong, formatDeadline, isoUtc } from "@/lib/berlin";
import { requireMember } from "@/lib/data";
import { availabilityLink } from "@/lib/evening-links";
import { getDbNow, getPeriods, getWindows } from "@/lib/evenings";

export const metadata: Metadata = { title: titles.zeiten };

export default async function AvailabilityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ form }, periods, now] = await Promise.all([requireMember(`/zeiten/${id}`), getPeriods(), getDbNow()]);
  const c = zeiten(form);
  const period = periods.find((p) => p.period_id === id);
  if (!period) {
    return (
      <div className="stack stack-lg">
        <PageHeader title={c.title} />
        <EmptyState title={c.errors.period_not_found!}>
          <p>{c.noPeriodText}</p>
        </EmptyState>
      </div>
    );
  }
  const windows = await getWindows(id);
  const days = periodDays(period.starts_on, period.ends_on);
  const cells = [...windowsToCells(windows)];
  const outside = windowsOutsideGrid(windows);
  const others = periods.filter((p) => p.period_id !== id);
  return (
    <div className="stack stack-lg">
      <p>
        <Link href="/abende" className="cluster back-link">
          <Icon name="arrowLeft" size={18} />
          {c.back}
        </Link>
      </p>
      <PageHeader eyebrow={c.periodLabel(formatDateKeyLong(period.starts_on), formatDateKeyLong(period.ends_on))} title={c.title} lead={c.lead}>
        <div className="cluster">
          <Badge tone={period.is_open ? "wine" : undefined}>{period.is_open ? c.openBadge : c.closedBadge}</Badge>
          {period.is_open ? <span className="deadline">{c.deadline(formatDeadline(period.answer_until, now))}</span> : null}
        </div>
      </PageHeader>
      {!period.is_open ? <Notice tone="info">{c.closed}</Notice> : null}
      {outside.length ? <Notice tone="warning">{c.outsideGrid(outside.length)}</Notice> : null}
      <details className="card card--outline how-to" open>
        <summary>
          <h2 className="card__title">{c.howTitle}</h2>
        </summary>
        <ul className="list-plain stack stack-sm" id="raster-hilfe">
          {c.how.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </details>
      <AvailabilityGrid periodId={id} days={days} initial={cells} now={isoUtc(now)} open={period.is_open} form={form} />
      {others.length ? (
        <Card title={c.otherPeriods} id="weitere" variant="sunk">
          <ul className="list-plain list-divided">
            {others.map((p) => (
              <li key={p.period_id} className="cluster">
                <Link href={availabilityLink(p.period_id)}>{c.periodLabel(formatDateKeyLong(p.starts_on), formatDateKeyLong(p.ends_on))}</Link>
                <span className="muted text-sm">{c.windowsCount(p.window_count)}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
