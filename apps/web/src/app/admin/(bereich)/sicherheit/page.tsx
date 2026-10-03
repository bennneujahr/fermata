import type { Metadata } from "next";
import { nowMs } from "@/app/admin/_lib/clock";
import Link from "next/link";
import { dateTime, labelOf } from "@/app/admin/_lib/format";
import { rpcOrThrow } from "@/app/admin/_lib/rpc";
import { reportTone } from "@/app/admin/_lib/tones";
import type { ReportRow } from "@/app/admin/_lib/types";
import { DueText } from "@/components/admin/Due";
import { FilterLinks } from "@/components/admin/FilterLinks";
import { SeverityBadge } from "@/components/admin/SeverityBadge";
import { Badge, PageHeader, TableWrap } from "@/components/ui";
import { adminSafety as c } from "@/copy/admin-sicherheit";

export const metadata: Metadata = { title: c.title };

const VIEWS = { offen: null, erledigt: "resolved", verworfen: "dismissed" } as const;

export default async function SafetyReports({ searchParams }: { searchParams: Promise<{ ansicht?: string }> }) {
  const { ansicht } = await searchParams;
  const view = (ansicht && ansicht in VIEWS ? ansicht : "offen") as keyof typeof VIEWS;
  const rows = await rpcOrThrow<ReportRow[]>("admin_reports", { p_status: VIEWS[view] });
  const now = nowMs();
  const r = c.reports;
  return (
    <>
      <PageHeader title={c.title} lead={c.lead} />
      <FilterLinks
        label={r.filterLabel}
        items={[
          { href: "/admin/sicherheit", label: r.showOpen, current: view === "offen" },
          { href: "/admin/sicherheit?ansicht=erledigt", label: r.showResolved, current: view === "erledigt" },
          { href: "/admin/sicherheit?ansicht=verworfen", label: r.showDismissed, current: view === "verworfen" },
        ]}
      />
      <TableWrap label={r.title}>
        <table className="table table--dense">
          <caption className="visually-hidden">{r.title}</caption>
          <thead>
            <tr>
              <th scope="col">{r.cols.due}</th>
              <th scope="col">{r.cols.severity}</th>
              <th scope="col">{r.cols.category}</th>
              <th scope="col">{r.cols.reported}</th>
              <th scope="col">{r.cols.reporter}</th>
              <th scope="col">{r.cols.status}</th>
              <th scope="col">{r.cols.created}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="muted">
                  {r.empty}
                </td>
              </tr>
            ) : (
              rows.map((x) => (
                <tr key={x.id} className={x.overdue ? "row--alert" : undefined}>
                  <td>{x.status === "open" || x.status === "in_review" ? <DueText at={x.due_at} now={now} /> : "–"}</td>
                  <td>
                    <SeverityBadge severity={x.severity} />
                  </td>
                  <th scope="row">
                    <Link href={`/admin/sicherheit/meldungen/${x.id}`}>{x.category_label}</Link>
                    <div className="muted text-sm">
                      {labelOf(c.contexts, x.context)}
                      {!x.related ? ` · ${r.noRelation}` : ""}
                    </div>
                  </th>
                  <td>
                    {x.reported_name ?? "–"}
                    {x.prior_reports_against > 0 ? <div className="muted text-sm">{r.prior(x.prior_reports_against)}</div> : null}
                    {x.active_sanction ? <div className="text-sm">{r.activeSanction(labelOf(c.sanctionKinds, x.active_sanction))}</div> : null}
                  </td>
                  <td>{x.reporter_name ?? "–"}</td>
                  <td>
                    <Badge tone={reportTone(x.status)}>{labelOf(c.status, x.status)}</Badge>
                  </td>
                  <td className="nowrap">{dateTime(x.created_at)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </TableWrap>
    </>
  );
}
