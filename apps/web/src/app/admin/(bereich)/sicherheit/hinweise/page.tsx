import type { Metadata } from "next";
import Link from "next/link";
import { dateTime, labelOf } from "@/app/admin/_lib/format";
import { rpcOrThrow } from "@/app/admin/_lib/rpc";
import type { FlagRow } from "@/app/admin/_lib/types";
import { FilterLinks } from "@/components/admin/FilterLinks";
import { ReviewFlagForm } from "@/components/admin/SanctionForms";
import { SeverityBadge } from "@/components/admin/SeverityBadge";
import { OpenTranscript } from "@/components/admin/TranscriptAccess";
import { PageHeader, TableWrap } from "@/components/ui";
import { adminSafety } from "@/copy/admin-sicherheit";

const c = adminSafety.flags;
export const metadata: Metadata = { title: c.title };

const str = (v: unknown) => (typeof v === "string" ? v : null);

export default async function FlagsPage({ searchParams }: { searchParams: Promise<{ alle?: string }> }) {
  const { alle } = await searchParams;
  const all = alle === "1";
  const rows = await rpcOrThrow<FlagRow[]>("admin_safety_flags", { p_open_only: !all, p_limit: 300 });
  return (
    <>
      <PageHeader title={c.title} lead={c.lead} />
      <FilterLinks
        label={c.filterLabel}
        items={[
          { href: "/admin/sicherheit/hinweise", label: c.showOpen, current: !all },
          { href: "/admin/sicherheit/hinweise?alle=1", label: c.showAll, current: all },
        ]}
      />
      <TableWrap label={c.title}>
        <table className="table table--dense">
          <caption className="visually-hidden">{c.title}</caption>
          <thead>
            <tr>
              <th scope="col">{c.cols.severity}</th>
              <th scope="col">{c.cols.kind}</th>
              <th scope="col">{c.cols.person}</th>
              <th scope="col">{c.cols.context}</th>
              <th scope="col">{c.cols.created}</th>
              <th scope="col">{c.cols.action}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="muted">
                  {c.empty}
                </td>
              </tr>
            ) : (
              rows.map((f) => {
                const session = str(f.details.session_id);
                const evening = str(f.details.evening_id);
                const report = str(f.details.report_id);
                return (
                  <tr key={f.id} className={f.severity === "akut" && !f.reviewed_at ? "row--alert" : undefined}>
                    <td>
                      <SeverityBadge severity={f.severity} />
                    </td>
                    <th scope="row">
                      {labelOf(c.kinds, f.kind)}
                      <div className="muted text-sm">{labelOf(c.sources, f.source)}</div>
                    </th>
                    <td>{f.user_id ? <Link href={`/admin/konten/${f.user_id}`}>{f.email ?? f.user_id}</Link> : "–"}</td>
                    <td className="stack stack-sm">
                      {report ? <Link href={`/admin/sicherheit/meldungen/${report}`}>{c.report}</Link> : null}
                      {evening ? <span className="muted text-sm">{c.evening}</span> : null}
                      {session && !f.reviewed_at ? <OpenTranscript sessionId={session} label={`${c.session} ${dateTime(f.created_at)}`} /> : null}
                      {!report && !evening && !session ? "–" : null}
                    </td>
                    <td className="nowrap">{dateTime(f.created_at)}</td>
                    <td>
                      {f.reviewed_at ? (
                        <span className="text-sm">
                          {dateTime(f.reviewed_at)}
                          <br />
                          <span className="muted">{c.reviewedWith(f.outcome ?? "")}</span>
                        </span>
                      ) : (
                        <ReviewFlagForm flagId={f.id} />
                      )}
                    </td>
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
