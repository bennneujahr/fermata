// Hinweise und Sperren zum eigenen Konto (api.my_sanctions) mit Widerspruch (api.appeal, api.my_appeals).
import type { Metadata } from "next";
import Link from "next/link";
import { AppealForm } from "@/components/sicherheit/AppealForm";
import { Badge, Card, EmptyState, Notice, PageHeader } from "@/components/ui";
import { appealStatus, sanctionKinds, sanctions as sanctionsCopy, titles } from "@/copy/sicherheit";
import { requireMember } from "@/lib/data";
import { formatDate, formatDateTime } from "@/lib/format";
import { getMyAppeals, getMySanctions } from "@/lib/safety";
import "@/components/sicherheit/sicherheit.css";

export const metadata: Metadata = { title: titles.sanktionen };

export default async function SanctionsPage() {
  const { form } = await requireMember("/sicherheit/sanktionen");
  const c = sanctionsCopy(form);
  const [sanctions, appeals] = await Promise.all([getMySanctions(), getMyAppeals()]);
  return (
    <div className="stack stack-lg">
      <p>
        <Link href="/sicherheit">{titles.back}</Link>
      </p>
      <PageHeader title={c.title} lead={c.lead} />
      {sanctions === null ? (
        <Notice tone="warning">{c.unavailable}</Notice>
      ) : sanctions.length === 0 ? (
        <EmptyState title={c.empty}>
          <p>{c.emptyText}</p>
        </EmptyState>
      ) : (
        <ul className="list-plain stack">
          {sanctions.map((s) => {
            const appeal = (appeals ?? []).find((a) => a.sanction_id === s.id);
            const ast = appeal ? appealStatus[appeal.status] : null;
            const lifted = Boolean(s.lifted_at);
            return (
              <li key={s.id}>
                <Card>
                  <div className="item-head">
                    <h2 className="card__title">{sanctionKinds[s.kind] ?? s.kind}</h2>
                    {lifted ? <Badge tone="success">{c.lifted(formatDate(s.lifted_at))}</Badge> : null}
                  </div>
                  <p className="item-meta">
                    {c.since(formatDateTime(s.starts_at))} · {s.ends_at ? c.until(formatDateTime(s.ends_at)) : c.unlimited}
                  </p>
                  <div className="stack stack-sm">
                    <h3 className="text-sm eyebrow">{c.reason}</h3>
                    <p>{s.reason}</p>
                  </div>
                  {s.kind === "vorlaeufige_sperre" && !lifted ? <Notice tone="info">{c.provisionalText}</Notice> : null}
                  {appeal && ast ? (
                    <div className="stack stack-sm">
                      <div className="item-head">
                        <h3>{c.appealOf}</h3>
                        <Badge tone={ast.tone}>{ast.label}</Badge>
                      </div>
                      <p className="item-meta">
                        {c.appealCreated(formatDateTime(appeal.created_at))}
                        {appeal.decided_at ? ` · ${c.appealDecided(formatDateTime(appeal.decided_at))}` : null}
                      </p>
                      {appeal.decision_note ? (
                        <p>
                          <strong>{c.appealNote}:</strong> {appeal.decision_note}
                        </p>
                      ) : null}
                    </div>
                  ) : !lifted ? (
                    <section className="stack stack-sm" aria-label={c.appealTitle}>
                      <h3>{c.appealTitle}</h3>
                      <AppealForm form={form} sanctionId={s.id} />
                    </section>
                  ) : null}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
