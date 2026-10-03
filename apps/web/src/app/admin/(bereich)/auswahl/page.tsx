import type { Metadata } from "next";
import Link from "next/link";
import { dateShort, dateTime, euro, num } from "@/app/admin/_lib/format";
import { rpcOrThrow } from "@/app/admin/_lib/rpc";
import type { MatchRunRow } from "@/app/admin/_lib/types";
import { runTone } from "@/app/admin/_lib/tones";
import { Badge, EmptyState, PageHeader, TableWrap } from "@/components/ui";
import { adminRuns as c } from "@/copy/admin-auswahl";

export const metadata: Metadata = { title: c.title };

export default async function RunsPage() {
  const runs = await rpcOrThrow<MatchRunRow[]>("admin_match_runs");
  return (
    <>
      <PageHeader title={c.title} lead={c.lead} />
      {runs.length === 0 ? (
        <EmptyState title={c.empty} />
      ) : (
        <TableWrap label={c.listTitle}>
          <table className="table table--dense">
            <caption className="visually-hidden">{c.listTitle}</caption>
            <thead>
              <tr>
                <th scope="col">{c.cols.period}</th>
                <th scope="col">{c.cols.status}</th>
                <th scope="col">{c.cols.started}</th>
                <th scope="col" className="num">
                  {c.cols.pool}
                </th>
                <th scope="col" className="num">
                  {c.cols.pairs}
                </th>
                <th scope="col" className="num">
                  {c.cols.pending}
                </th>
                <th scope="col" className="num">
                  {c.cols.approved}
                </th>
                <th scope="col" className="num">
                  {c.cols.rejected}
                </th>
                <th scope="col" className="num">
                  {c.cols.cost}
                </th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <th scope="row">
                    <Link href={`/admin/auswahl/${r.id}`}>
                      {r.period_starts_on ? `${dateShort(r.period_starts_on)} – ${dateShort(r.period_ends_on)}` : c.detail.titleNoPeriod}
                    </Link>
                  </th>
                  <td>
                    <Badge tone={runTone(r.status)}>{c.status[r.status] ?? r.status}</Badge>
                  </td>
                  <td className="nowrap">{dateTime(r.started_at ?? r.scheduled_for)}</td>
                  <td className="num">{num(r.pool_size)}</td>
                  <td className="num">{num(r.proposed_pairs)}</td>
                  <td className="num">{r.pending_review > 0 ? <strong>{num(r.pending_review)}</strong> : num(r.pending_review)}</td>
                  <td className="num">{num(r.approved)}</td>
                  <td className="num">{num(r.rejected)}</td>
                  <td className="num">{euro(r.cost_eur)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
    </>
  );
}
