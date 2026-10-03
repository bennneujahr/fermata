// Abend teilen: je bestätigtem Abend einen Link für eine Vertrauensperson erstellen oder zurückziehen.
// Einstieg auch aus einem Abend: /sicherheit/teilen?abend=<id>.
import type { Metadata } from "next";
import Link from "next/link";
import { TrustSharePanel } from "@/components/sicherheit/TrustSharePanel";
import { Card, EmptyState, Notice, PageHeader } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { titles, trustShare } from "@/copy/sicherheit";
import { requireMember } from "@/lib/data";
import { formatDayTime } from "@/lib/datetime";
import { getMyEvenings, getMyTrustShares } from "@/lib/safety";
import { activeShares, shareableEvenings } from "@/lib/safety-rules";
import "@/components/sicherheit/sicherheit.css";

export const metadata: Metadata = { title: titles.teilen };

export default async function TrustSharePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const focus = typeof sp.abend === "string" ? sp.abend : null;
  const { form } = await requireMember(focus ? `/sicherheit/teilen?abend=${encodeURIComponent(focus)}` : "/sicherheit/teilen");
  const c = trustShare(form);
  const [evenings, shares] = await Promise.all([getMyEvenings(), getMyTrustShares()]);
  const list = shareableEvenings(evenings ?? []);
  const shown = focus && list.some((e) => e.evening_id === focus) ? list.filter((e) => e.evening_id === focus) : list;
  return (
    <div className="stack stack-lg">
      <p>
        <Link href="/sicherheit">{titles.sicherheit}</Link>
      </p>
      <PageHeader title={c.title} lead={c.lead} />
      <div className="share-sees">
        <Card title={c.seesTitle} variant="sunk" id="sieht">
          <ul className="list-check list-plain stack stack-sm">
            {c.sees.map((s) => (
              <li key={s}>
                <Icon name="check" size={18} />
                <span>{s}</span>
              </li>
            ))}
          </ul>
          <p className="soft">{c.notSees}</p>
        </Card>
        <Card variant="outline">
          <p className="cluster">
            <Icon name="clock" />
            <span className="soft">{c.expiry}</span>
          </p>
        </Card>
      </div>
      {evenings === null ? <Notice tone="warning">{c.unavailable}</Notice> : null}
      {focus && !list.some((e) => e.evening_id === focus) && evenings !== null ? <Notice tone="info">{c.errors.evening_not_confirmed}</Notice> : null}
      {evenings !== null && shown.length === 0 ? (
        <EmptyState title={c.emptyTitle}>
          <p>{c.emptyText}</p>
        </EmptyState>
      ) : (
        <ul className="list-plain stack">
          {shown.map((e) => (
            <li key={e.evening_id}>
              <Card id={`abend-${e.evening_id}`} title={c.eveningTitle(formatDayTime(e.starts_at), e.venue?.name ?? null)} eyebrow={e.counterpart_first_name ? c.withName(e.counterpart_first_name) : undefined}>
                <TrustSharePanel form={form} eveningId={e.evening_id} shares={activeShares(shares ?? [], e.evening_id)} />
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
