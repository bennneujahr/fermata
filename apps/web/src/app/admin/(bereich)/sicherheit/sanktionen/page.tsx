import type { Metadata } from "next";
import { nowMs } from "@/app/admin/_lib/clock";
import Link from "next/link";
import { dateTime, labelOf } from "@/app/admin/_lib/format";
import { rpcOrThrow } from "@/app/admin/_lib/rpc";
import { sanctionTone } from "@/app/admin/_lib/tones";
import type { SanctionRow } from "@/app/admin/_lib/types";
import { FilterLinks } from "@/components/admin/FilterLinks";
import { LiftSanctionForm } from "@/components/admin/SanctionForms";
import { Badge, PageHeader, TableWrap } from "@/components/ui";
import { adminSafety } from "@/copy/admin-sicherheit";

const c = adminSafety.sanctions;
export const metadata: Metadata = { title: c.title };

export default async function SanctionsPage({ searchParams }: { searchParams: Promise<{ alle?: string }> }) {
  const { alle } = await searchParams;
  const all = alle === "1";
  const rows = await rpcOrThrow<SanctionRow[]>("admin_sanctions", { p_user: null, p_only_active: !all });
  const now = nowMs();
  return (
    <>
      <PageHeader title={c.title} lead={c.lead} />
      <FilterLinks
        label={c.filterLabel}
        items={[
          { href: "/admin/sicherheit/sanktionen", label: c.showActive, current: !all },
          { href: "/admin/sicherheit/sanktionen?alle=1", label: c.showAll, current: all },
        ]}
      />
      <TableWrap label={c.title}>
        <table className="table table--dense">
          <caption className="visually-hidden">{c.title}</caption>
          <thead>
            <tr>
              <th scope="col">{c.cols.person}</th>
              <th scope="col">{c.cols.kind}</th>
              <th scope="col">{c.cols.reason}</th>
              <th scope="col">{c.cols.since}</th>
              <th scope="col">{c.cols.until}</th>
              <th scope="col">{c.cols.appeal}</th>
              <th scope="col">{c.cols.action}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="muted">
                  {c.empty}
                </td>
              </tr>
            ) : (
              rows.map((s) => {
                const active = !s.lifted_at && (!s.ends_at || Date.parse(s.ends_at) > now);
                return (
                  <tr key={s.id}>
                    <th scope="row">
                      <Link href={`/admin/konten/${s.user_id}`}>{s.person ?? s.user_id}</Link>
                      {s.report_id ? (
                        <div className="text-sm">
                          <Link href={`/admin/sicherheit/meldungen/${s.report_id}`}>{c.open}</Link>
                        </div>
                      ) : null}
                    </th>
                    <td>
                      <Badge tone={sanctionTone(s.kind)}>{labelOf(adminSafety.sanctionKinds, s.kind)}</Badge>
                    </td>
                    <td className="text-sm">{s.reason}</td>
                    <td className="nowrap">{dateTime(s.starts_at)}</td>
                    <td className="nowrap">{s.lifted_at ? `${adminSafety.report.lifted} ${dateTime(s.lifted_at)}` : s.ends_at ? dateTime(s.ends_at) : c.noEnd}</td>
                    <td>{s.appeal ? labelOf(c.appealStatus, s.appeal.status) : "–"}</td>
                    <td>{active ? <LiftSanctionForm sanctionId={s.id} compact /> : "–"}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </TableWrap>
    </>
  );
}
