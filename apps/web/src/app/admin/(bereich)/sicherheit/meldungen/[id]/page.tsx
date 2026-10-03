import type { Metadata } from "next";
import { nowMs } from "@/app/admin/_lib/clock";
import Link from "next/link";
import { notFound } from "next/navigation";
import { decideReportAction, takeReportAction } from "@/app/admin/_actions/safety";
import { dateTime, labelOf } from "@/app/admin/_lib/format";
import { rpc } from "@/app/admin/_lib/rpc";
import { reportTone, sanctionTone } from "@/app/admin/_lib/tones";
import type { ReportDetail } from "@/app/admin/_lib/types";
import { ActionForm } from "@/components/admin/ActionForm";
import { DueText } from "@/components/admin/Due";
import { ImposeSanctionForm, LiftSanctionForm } from "@/components/admin/SanctionForms";
import { SeverityBadge } from "@/components/admin/SeverityBadge";
import { CaseSessions } from "@/components/admin/TranscriptAccess";
import { Badge, ButtonLink, Card, Checkbox, Icon, Notice, PageHeader, RadioGroup, TextArea } from "@/components/ui";
import { adminCommon } from "@/copy/admin-common";
import { adminToday } from "@/copy/admin-heute";
import { adminSafety as c } from "@/copy/admin-sicherheit";
import { admin } from "@/copy/admin";

export const metadata: Metadata = { title: c.reports.title };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const res = await rpc<ReportDetail>("admin_report", { p_report_id: id });
  if (res.error?.hint === "report_not_found" || (!res.data && !res.error)) notFound();
  if (res.error) throw new Error(res.error.message);
  const d = res.data!;
  const rep = d.report;
  const r = c.report;
  const isOpen = rep.status === "open" || rep.status === "in_review";
  const now = nowMs();
  const provisional = d.sanctions.find((s) => s.kind === "vorlaeufige_sperre" && s.report_id === rep.id && !s.lifted_at);
  const activeSanctions = d.sanctions.filter((s) => !s.lifted_at && (!s.ends_at || Date.parse(s.ends_at) > now));

  return (
    <>
      <p>
        <Link href="/admin/sicherheit" className="cluster">
          <Icon name="arrowLeft" size={18} />
          <span>{r.back}</span>
        </Link>
      </p>
      <PageHeader title={r.title(rep.category_label)}>
        <div className="cluster">
          <SeverityBadge severity={rep.severity} />
          <Badge tone={reportTone(rep.status)}>{labelOf(c.status, rep.status)}</Badge>
          {isOpen ? <DueText at={rep.due_at} now={now} /> : null}
        </div>
      </PageHeader>

      <div className="two-col">
        <Card title={r.facts} headingLevel={2}>
          <dl className="facts">
            <dt>{r.context}</dt>
            <dd>{labelOf(c.contexts, rep.context)}</dd>
            <dt>{r.received}</dt>
            <dd>{dateTime(rep.created_at)}</dd>
            <dt>{r.due}</dt>
            <dd>{dateTime(rep.due_at)}</dd>
            <dt>{r.related}</dt>
            <dd>{rep.related ? adminCommon.yes : r.relatedNo}</dd>
            <dt>{r.wantsContact}</dt>
            <dd>{rep.wants_contact ? adminCommon.yes : adminCommon.no}</dd>
            {rep.resolved_at ? (
              <>
                <dt>{r.resolved}</dt>
                <dd>{dateTime(rep.resolved_at)}</dd>
                <dt>{r.resolution}</dt>
                <dd>{rep.resolution}</dd>
              </>
            ) : null}
          </dl>
          <h3 className="pairing__label">{r.description}</h3>
          <blockquote className="quote">{rep.description || r.noDescription}</blockquote>
        </Card>

        <Card title={r.people} headingLevel={2}>
          <dl className="facts">
            <dt>{r.reporter}</dt>
            <dd>{d.reporter.user_id ? <Link href={`/admin/konten/${d.reporter.user_id}`}>{d.reporter.name}</Link> : "–"}</dd>
            <dt>{r.reported}</dt>
            <dd>{d.reported ? <Link href={`/admin/konten/${d.reported.user_id}`}>{d.reported.name}</Link> : "–"}</dd>
            {d.reported ? (
              <>
                <dt>{r.accountStatus}</dt>
                <dd>{labelOf(admin.status, d.reported.account_status)}</dd>
              </>
            ) : null}
          </dl>
          <p className="muted text-sm">{r.reporterHidden}</p>
        </Card>
      </div>

      <Card title={r.evening} headingLevel={2}>
        {d.evening ? (
          <div className="two-col">
            <dl className="facts">
              <dt>{r.eveningStart}</dt>
              <dd>{dateTime(d.evening.starts_at)}</dd>
              <dt>{r.eveningState}</dt>
              <dd>{labelOf(adminToday.kpi.states, d.evening.state)}</dd>
              <dt>{r.venue}</dt>
              <dd>{d.evening.venue ? `${d.evening.venue.name}, ${d.evening.venue.street}, ${d.evening.venue.postal_code} ${d.evening.venue.city}` : "–"}</dd>
            </dl>
            <div className="stack stack-sm">
              <h3 className="pairing__label">{r.events}</h3>
              {d.evening.events.length === 0 ? <p className="muted">{r.none}</p> : (
                <ol className="timeline">
                  {d.evening.events.map((e, i) => (
                    <li key={i}>
                      <span className="nowrap muted">{dateTime(e.at)}</span>
                      <span>
                        {labelOf(adminToday.kpi.states, e.from)} → {labelOf(adminToday.kpi.states, e.to)}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
              <h3 className="pairing__label">{r.checkins}</h3>
              {d.evening.checkins.length === 0 ? <p className="muted">{r.none}</p> : (
                <ol className="timeline">
                  {d.evening.checkins.map((ch, i) => (
                    <li key={i}>
                      <span className="nowrap muted">{dateTime(ch.at)}</span>
                      <span>
                        {ch.user_id === d.reporter.user_id ? r.reporter : ch.user_id === d.reported?.user_id ? r.reported : adminCommon.person}: {labelOf(r.checkinStatus, ch.status)}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        ) : (
          <p className="muted">{r.noEvening}</p>
        )}
      </Card>

      <Card title={r.history} headingLevel={2}>
        <div className="two-col">
          <div className="stack stack-sm">
            <h3 className="pairing__label">{r.priorReports}</h3>
            {d.prior_reports_against.length === 0 ? <p className="muted">{r.none}</p> : (
              <ul className="list-plain stack stack-sm">
                {d.prior_reports_against.map((p) => (
                  <li key={p.id} className="cluster">
                    <Link href={`/admin/sicherheit/meldungen/${p.id}`}>{dateTime(p.created_at)}</Link>
                    <span className="muted">{p.category}</span>
                    <Badge tone={reportTone(p.status)}>{labelOf(c.status, p.status)}</Badge>
                  </li>
                ))}
              </ul>
            )}
            <h3 className="pairing__label">{r.flags}</h3>
            {d.flags.length === 0 ? <p className="muted">{r.none}</p> : (
              <ul className="list-plain stack stack-sm">
                {d.flags.map((f) => (
                  <li key={f.id} className="cluster">
                    <SeverityBadge severity={f.severity} />
                    <span>{labelOf(c.flags.kinds, f.kind)}</span>
                    <span className="muted text-sm">{f.reviewed_at ? c.flags.reviewedWith(f.outcome ?? "") : adminCommon.open}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="stack stack-sm">
            <h3 className="pairing__label">{r.sanctions}</h3>
            {d.sanctions.length === 0 ? <p className="muted">{r.none}</p> : (
              <ul className="list-plain list-divided">
                {d.sanctions.map((s) => {
                  const active = activeSanctions.some((a) => a.id === s.id);
                  return (
                    <li key={s.id} className="stack stack-sm">
                      <div className="cluster">
                        <Badge tone={sanctionTone(s.kind)}>{labelOf(c.sanctionKinds, s.kind)}</Badge>
                        <span className="text-sm">
                          {r.since} {dateTime(s.starts_at)}
                          {s.ends_at ? ` ${r.until} ${dateTime(s.ends_at)}` : ""}
                        </span>
                        {s.lifted_at ? <span className="muted text-sm">{r.lifted} {dateTime(s.lifted_at)}</span> : null}
                      </div>
                      <p className="text-sm soft">{s.reason}</p>
                      {active ? <LiftSanctionForm sanctionId={s.id} compact /> : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </Card>

      {isOpen ? (
        <Card title={r.actions} headingLevel={2} variant="accent">
          {rep.status === "open" ? (
            <ActionForm action={takeReportAction} submitLabel={r.takeReview} variant="secondary" errors={c.errors}>
              <input type="hidden" name="report_id" value={rep.id} />
            </ActionForm>
          ) : null}
          <h3>{r.decideTitle}</h3>
          <ActionForm action={decideReportAction} submitLabel={r.decide} errors={c.errors}>
            <input type="hidden" name="report_id" value={rep.id} />
            <input type="hidden" name="has_provisional" value={provisional ? "1" : "0"} />
            <RadioGroup legend={r.decision} name="decision" options={Object.entries(r.decisions).map(([value, label]) => ({ value, label }))} required />
            <TextArea label={r.resolutionLabel} hint={r.resolutionHint} name="resolution" rows={3} className="textarea--plain" required minLength={3} maxLength={4000} />
            {provisional ? <Checkbox name="lift_provisional" label={r.liftProvisional} description={r.liftProvisionalHint} defaultChecked /> : null}
          </ActionForm>
        </Card>
      ) : (
        <Notice tone="info">{r.closed}</Notice>
      )}

      {d.reported ? (
        <Card title={c.sanction.title} headingLevel={2}>
          <p className="soft">{c.sanction.for(d.reported.name ?? "–")}</p>
          <ImposeSanctionForm userId={d.reported.user_id} reportId={rep.id} />
        </Card>
      ) : null}

      <div className="two-col">
        <Card title={r.police} headingLevel={2}>
          <p className="soft text-sm">{r.policeHint}</p>
          <div>
            <ButtonLink href={`/admin/sicherheit/meldungen/${rep.id}/polizei`} variant="secondary" icon="external">
              {r.policeLink}
            </ButtonLink>
          </div>
        </Card>
        {d.reported ? (
          <Card title={c.transcript.title} headingLevel={2}>
            <p className="soft text-sm">{c.transcript.lead}</p>
            <CaseSessions userId={d.reported.user_id} />
          </Card>
        ) : null}
      </div>
    </>
  );
}
