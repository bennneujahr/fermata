import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { finishRunAction } from "@/app/admin/_actions/runs";
import { dateShort, dateTime, euro, num } from "@/app/admin/_lib/format";
import { pairingWarnings } from "@/app/admin/_lib/pairing";
import { rpc, rpcOrThrow } from "@/app/admin/_lib/rpc";
import type { MatchRunRow, PairingRow, PairingTimes } from "@/app/admin/_lib/types";
import { ActionForm } from "@/components/admin/ActionForm";
import { Figures } from "@/components/admin/Figures";
import { Badge, Card, Checkbox, Icon, Notice, PageHeader } from "@/components/ui";
import { adminRuns as c } from "@/copy/admin-auswahl";
import { runTone } from "@/app/admin/_lib/tones";
import { RunReportView } from "./RunReport";
import { RunReview, type ReviewPairing } from "./RunReview";

export const metadata: Metadata = { title: c.title };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const runs = await rpcOrThrow<MatchRunRow[]>("admin_match_runs");
  const run = runs.find((r) => r.id === id);
  if (!run) notFound();
  const pairings = await rpcOrThrow<PairingRow[]>("admin_run_pairings", { p_run_id: id });
  const times = (await rpc<PairingTimes[]>("admin_pairing_times", { p_run_id: id })).data ?? [];
  const timeMap = new Map(times.map((t) => [t.pairing_id, t]));
  const review: ReviewPairing[] = pairings.map((p) => {
    const t = timeMap.get(p.pairing_id);
    const list = (t?.times ?? []).map((x) => (typeof x === "string" ? x : x.starts_at)).filter(Boolean) as string[];
    return { ...p, warnings: pairingWarnings(p), times: list, timesPreview: t?.preview ?? false };
  });
  const canDecide = run.status === "review";
  const title = run.period_starts_on ? c.detail.title(dateShort(run.period_starts_on), dateShort(run.period_ends_on)) : c.detail.titleNoPeriod;
  const runtime = run.report?.laufzeit_sekunden?.gesamt;

  return (
    <>
      <p>
        <Link href="/admin/auswahl" className="cluster">
          <Icon name="arrowLeft" size={18} />
          <span>{c.detail.back}</span>
        </Link>
      </p>
      <PageHeader title={title}>
        <div className="cluster">
          <Badge tone={runTone(run.status)}>{c.status[run.status] ?? run.status}</Badge>
          <span className="muted text-sm">
            {c.detail.finishedAt}: {dateTime(run.finished_at)}
          </span>
        </div>
      </PageHeader>

      <Card title={c.detail.summary} headingLevel={2} id="ueberblick">
        <Figures
          items={[
            { label: c.detail.pool, value: num(run.pool_size) },
            { label: c.detail.pairs, value: num(run.proposed_pairs) },
            { label: c.detail.pending, value: num(run.pending_review) },
            { label: c.detail.approved, value: num(run.approved) },
            { label: c.detail.rejected, value: num(run.rejected) },
            { label: c.detail.cost, value: euro(run.cost_eur) },
            { label: c.detail.runtime, value: runtime === undefined ? "–" : `${num(runtime, 1)} s` },
          ]}
        />
        {run.error ? (
          <Notice tone="danger" title={c.detail.error}>
            <pre className="template">{run.error.split("\n")[0]}</pre>
          </Notice>
        ) : null}
        {!canDecide ? <Notice tone="info">{c.detail.notReview}</Notice> : null}
      </Card>

      <section className="stack" aria-labelledby="vorschlaege">
        <h2 id="vorschlaege">{c.pairings.title}</h2>
        <RunReview runId={run.id} pairings={review} canDecide={canDecide} />
      </section>

      {canDecide ? (
        <Card title={c.finish.title} headingLevel={2} variant="accent" id="abschluss">
          <p className="soft">{c.finish.lead}</p>
          {run.pending_review > 0 ? <Notice tone="warning">{c.finish.pending(run.pending_review)}</Notice> : null}
          <ActionForm
            action={finishRunAction}
            submitLabel={c.finish.submit}
            variant="secondary"
            confirm={{ title: c.finish.dialogTitle, text: c.finish.dialogText, confirmLabel: c.finish.confirm }}
          >
            <input type="hidden" name="run_id" value={run.id} />
            {run.pending_review > 0 ? <Checkbox name="reject_pending" label={c.finish.rejectPending} /> : null}
          </ActionForm>
        </Card>
      ) : null}

      <section className="stack" aria-labelledby="bericht">
        <h2 id="bericht">{c.report.title}</h2>
        <RunReportView report={run.report} />
      </section>
    </>
  );
}
