import type { Metadata } from "next";
import Link from "next/link";
import { dateTime, labelOf } from "@/app/admin/_lib/format";
import { rpcOrThrow } from "@/app/admin/_lib/rpc";
import type { FlagRow } from "@/app/admin/_lib/types";
import { FilterLinks } from "@/components/admin/FilterLinks";
import { ReviewFlagForm } from "@/components/admin/SanctionForms";
import { SeverityBadge } from "@/components/admin/SeverityBadge";
import { OpenTranscript } from "@/components/admin/TranscriptAccess";
import { EmptyState, PageHeader } from "@/components/ui";
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
      {rows.length === 0 ? (
        <EmptyState title={c.empty} />
      ) : (
        <ul className="flag-list" aria-label={c.title}>
          {rows.map((f) => {
            const session = str(f.details.session_id);
            const evening = str(f.details.evening_id);
            const report = str(f.details.report_id);
            return (
              <li key={f.id} data-flag={f.id} className={["flag", f.severity === "akut" && !f.reviewed_at && "flag--alert", f.reviewed_at && "flag--done"].filter(Boolean).join(" ")}>
                <div className="flag__main">
                  <div className="cluster">
                    <SeverityBadge severity={f.severity} />
                    <strong>{labelOf(c.kinds, f.kind)}</strong>
                    <span className="muted text-sm">
                      {labelOf(c.sources, f.source)} · {dateTime(f.created_at)}
                    </span>
                  </div>
                  <div className="cluster text-sm">
                    <span className="soft">{c.cols.person}:</span>
                    {f.user_id ? <Link href={`/admin/konten/${f.user_id}`}>{f.email ?? f.user_id}</Link> : <span>–</span>}
                    {report ? <Link href={`/admin/sicherheit/meldungen/${report}`}>{c.report}</Link> : null}
                    {evening ? <span className="muted">{c.evening}</span> : null}
                    {session ? <span className="muted">{c.session}</span> : null}
                  </div>
                </div>
                <div className="flag__actions">
                  {f.reviewed_at ? (
                    <p className="text-sm">
                      {c.cols.reviewed} {dateTime(f.reviewed_at)}
                      <br />
                      <span className="muted">{c.reviewedWith(f.outcome ?? "")}</span>
                    </p>
                  ) : (
                    <ReviewFlagForm flagId={f.id} />
                  )}
                </div>
                {session && !f.reviewed_at ? (
                  <div className="flag__wide">
                    <OpenTranscript sessionId={session} label={`${c.session} ${dateTime(f.created_at)}`} />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
