// Eigene Meldungen (api.my_reports) mit Stand.
import type { Metadata } from "next";
import Link from "next/link";
import { Badge, ButtonLink, Card, EmptyState, Notice, PageHeader } from "@/components/ui";
import { categoryLabels, contextLabels, myReports, reportStatus, titles } from "@/copy/sicherheit";
import { requireMember } from "@/lib/data";
import { formatDateTime } from "@/lib/format";
import { getMyReports } from "@/lib/safety";
import "@/components/sicherheit/sicherheit.css";

export const metadata: Metadata = { title: titles.meldungen };

export default async function MyReportsPage() {
  const { form } = await requireMember("/sicherheit/meldungen");
  const c = myReports(form);
  const reports = await getMyReports();
  return (
    <div className="stack stack-lg">
      <p>
        <Link href="/sicherheit">{titles.sicherheit}</Link>
      </p>
      <PageHeader title={c.title} lead={c.lead} actions={<ButtonLink href="/sicherheit/melden" icon="flag">{c.newReport}</ButtonLink>} />
      {reports === null ? (
        <Notice tone="warning">{c.unavailable}</Notice>
      ) : reports.length === 0 ? (
        <EmptyState title={c.empty}>
          <p>{c.emptyText}</p>
        </EmptyState>
      ) : (
        <Card>
          <ul className="list-plain list-divided">
            {reports.map((r) => {
              const st = reportStatus[r.status] ?? { label: r.status, tone: "brass" as const };
              const open = r.status === "open" || r.status === "in_review";
              return (
                <li key={r.id}>
                  <div className="item-head">
                    <h3>{categoryLabels[r.category]?.label ?? r.category}</h3>
                    <Badge tone={st.tone}>{st.label}</Badge>
                  </div>
                  <div className="item-body">
                    <p className="item-meta">
                      {contextLabels[r.context] ?? r.context} · {c.created(formatDateTime(r.created_at))}
                    </p>
                    {open && r.due_at ? <p className="item-meta">{c.due(formatDateTime(r.due_at))}</p> : null}
                    {!open && r.resolved_at ? <p className="item-meta">{c.resolved(formatDateTime(r.resolved_at))}</p> : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
