import type { Metadata } from "next";
import Link from "next/link";
import { dateTime, labelOf } from "@/app/admin/_lib/format";
import { rpcOrThrow } from "@/app/admin/_lib/rpc";
import { sanctionTone } from "@/app/admin/_lib/tones";
import type { AppealRow } from "@/app/admin/_lib/types";
import { FilterLinks } from "@/components/admin/FilterLinks";
import { DecideAppealForm } from "@/components/admin/SanctionForms";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { adminSafety } from "@/copy/admin-sicherheit";

const c = adminSafety.appeals;
export const metadata: Metadata = { title: c.title };

export default async function AppealsPage({ searchParams }: { searchParams: Promise<{ alle?: string }> }) {
  const { alle } = await searchParams;
  const all = alle === "1";
  const rows = await rpcOrThrow<AppealRow[]>("admin_appeals", { p_status: all ? null : "open" });
  return (
    <>
      <PageHeader title={c.title} lead={c.lead} />
      <FilterLinks
        label={c.filterLabel}
        items={[
          { href: "/admin/sicherheit/widersprueche", label: c.showOpen, current: !all },
          { href: "/admin/sicherheit/widersprueche?alle=1", label: c.showAll, current: all },
        ]}
      />
      {rows.length === 0 ? <EmptyState title={c.empty} /> : null}
      {rows.map((a) => (
        <Card
          key={a.id}
          headingLevel={2}
          title={a.person ?? "–"}
          eyebrow={`${c.received} ${dateTime(a.created_at)}`}
          variant={a.status === "open" ? "accent" : "outline"}
        >
          <div className="cluster">
            <span className="soft text-sm">{c.sanction}:</span>
            {a.sanction ? <Badge tone={sanctionTone(a.sanction.kind)}>{labelOf(adminSafety.sanctionKinds, a.sanction.kind)}</Badge> : null}
            {a.sanction ? <span className="text-sm muted">{dateTime(a.sanction.starts_at)}</span> : null}
            {a.sanction?.report_id ? <Link href={`/admin/sicherheit/meldungen/${a.sanction.report_id}`}>{adminSafety.sanctions.open}</Link> : null}
            <Link href={`/admin/konten/${a.user_id}`}>{adminSafety.report.accountStatus}</Link>
          </div>
          {a.sanction?.reason ? <p className="text-sm soft">{a.sanction.reason}</p> : null}
          <h3 className="pairing__label">{c.text}</h3>
          <blockquote className="quote">{a.text}</blockquote>
          {a.status === "open" ? (
            <DecideAppealForm appealId={a.id} />
          ) : (
            <p className="text-sm">
              <Badge tone={a.status === "accepted" ? "success" : undefined}>{labelOf(adminSafety.sanctions.appealStatus, a.status)}</Badge>{" "}
              {c.decidedAt(dateTime(a.decided_at))}: {a.decision_note}
            </p>
          )}
        </Card>
      ))}
    </>
  );
}
