import type { Metadata } from "next";
import Link from "next/link";
import { dateShort, dateTime, euro, kNum, labelOf, num, pct } from "@/app/admin/_lib/format";
import { rpc, rpcOrThrow } from "@/app/admin/_lib/rpc";
import type { AdminKpis, AdminToday, KCount } from "@/app/admin/_lib/types";
import { BarTable, type BarRow } from "@/components/admin/BarTable";
import { DueText } from "@/components/admin/Due";
import { Figures } from "@/components/admin/Figures";
import { SeverityBadge } from "@/components/admin/SeverityBadge";
import { Icon, Notice, PageHeader } from "@/components/ui";
import { admin } from "@/copy/admin";
import { adminCommon } from "@/copy/admin-common";
import { adminToday as c } from "@/copy/admin-heute";
import { adminSafety } from "@/copy/admin-sicherheit";
import { adminWaitlist } from "@/copy/admin-warteliste";
import type { AdminOverview } from "@/lib/admin";

export const metadata: Metadata = { title: c.title };

function rowsOf(obj: Record<string, KCount> | undefined, labels: Record<string, string>, order?: string[]): BarRow[] {
  const keys = order ? order.filter((k) => obj && k in obj) : Object.keys(obj ?? {}).sort((a, b) => (obj![b] ?? 0) - (obj![a] ?? 0));
  return keys.map((k) => ({ key: k, label: labelOf(labels, k), value: obj![k] ?? null }));
}

function Todo({ title, count, tone, children, footer }: { title: string; count?: number; tone?: "alert" | "attention" | "calm"; children: React.ReactNode; footer?: React.ReactNode }) {
  const id = `todo-${title.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <section className={["todo", tone && `todo--${tone}`].filter(Boolean).join(" ")} aria-labelledby={id}>
      <div className="todo__head">
        <h3 className="todo__title" id={id}>
          {title}
        </h3>
        {count !== undefined ? <span className="todo__count">{num(count)}</span> : null}
      </div>
      {children}
      {footer ? <div className="todo__footer">{footer}</div> : null}
    </section>
  );
}

export default async function AdminToday() {
  const [today, kpis, overview] = await Promise.all([
    rpcOrThrow<AdminToday>("admin_today"),
    rpcOrThrow<AdminKpis>("admin_kpis"),
    rpc<AdminOverview>("admin_overview"),
  ]);
  const now = Date.parse(today.generated_at);
  const k = kpis.k;
  const t = c.kpi;
  const flagsOpen = Object.values(today.flags_by_severity).reduce((a, b) => a + b, 0);
  const o = overview.data;

  return (
    <>
      <PageHeader title={c.title} lead={c.lead} />

      <section className="stack" aria-labelledby="zu-tun">
        <h2 id="zu-tun">{c.todoTitle}</h2>
        <div className="todo-grid">
          <Todo title={c.runs.title} count={today.runs_review.length} tone={today.runs_review.length ? "attention" : "calm"}>
            {today.runs_review.length === 0 ? <p className="muted text-sm">{c.runs.empty}</p> : (
              <ul className="todo__list">
                {today.runs_review.map((r) => (
                  <li key={r.id} className="todo__row">
                    <Link href={`/admin/auswahl/${r.id}`}>
                      {r.period_starts_on ? c.runs.period(dateShort(r.period_starts_on), dateShort(r.period_ends_on)) : admin.nav.runs}
                    </Link>
                    <span>
                      {c.runs.item(r.pending)}
                      {r.with_warnings > 0 ? (
                        <>
                          {" · "}
                          <strong className="due due--soon">{c.runs.warnings(r.with_warnings)}</strong>
                        </>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {today.runs_failed_recent > 0 ? <Notice tone="danger">{c.runs.failed(today.runs_failed_recent)}</Notice> : null}
            {today.runs_running > 0 ? <p className="muted text-sm">{c.runs.running}</p> : null}
          </Todo>

          <Todo
            title={c.reports.title}
            count={today.reports.open}
            tone={today.reports.overdue > 0 ? "alert" : today.reports.open > 0 ? "attention" : "calm"}
            footer={<Link href="/admin/sicherheit">{c.reports.all}</Link>}
          >
            <p className="soft text-sm">
              {c.reports.lead}
              {today.reports.overdue > 0 ? (
                <>
                  {" "}
                  <strong className="due due--overdue">
                    <Icon name="alert" size={16} /> {num(today.reports.overdue)} {c.reports.overdue}
                  </strong>
                </>
              ) : null}
            </p>
            {today.reports.items.length === 0 ? <p className="muted text-sm">{c.reports.empty}</p> : (
              <ul className="todo__list">
                {today.reports.items.map((r) => (
                  <li key={r.id} className="todo__row">
                    <span className="cluster">
                      <SeverityBadge severity={r.severity} />
                      <Link href={`/admin/sicherheit/meldungen/${r.id}`}>{r.category_label}</Link>
                    </span>
                    <DueText at={r.due_at} now={now} />
                  </li>
                ))}
              </ul>
            )}
            {today.provisional_suspensions > 0 ? <p className="text-sm">{c.provisional(today.provisional_suspensions)}</p> : null}
          </Todo>

          <Todo
            title={c.flags.title}
            count={flagsOpen}
            tone={today.flags_by_severity.akut > 0 ? "alert" : flagsOpen > 0 ? "attention" : "calm"}
            footer={<Link href="/admin/sicherheit/hinweise">{c.flags.all}</Link>}
          >
            {flagsOpen === 0 ? <p className="muted text-sm">{c.flags.empty}</p> : (
              <ul className="todo__list">
                {(["akut", "hoch", "mittel", "niedrig"] as const).map((s) =>
                  today.flags_by_severity[s] > 0 ? (
                    <li key={s} className="todo__row">
                      <SeverityBadge severity={s} />
                      <strong>{num(today.flags_by_severity[s])}</strong>
                    </li>
                  ) : null,
                )}
              </ul>
            )}
          </Todo>

          <Todo title={c.reservations.title} count={today.reservations_unconfirmed.length} tone={today.reservations_unconfirmed.length ? "attention" : "calm"}>
            {today.reservations_unconfirmed.length === 0 ? <p className="muted text-sm">{c.reservations.empty}</p> : (
              <ul className="todo__list">
                {today.reservations_unconfirmed.slice(0, 6).map((r) => (
                  <li key={r.reservation_id} className="stack stack-sm">
                    <span className="todo__row">
                      <Link href={`/admin/lokale/${r.venue_id}`}>{r.venue_name}</Link>
                      <span className="nowrap">{dateTime(r.starts_at)}</span>
                    </span>
                    <span className="muted">
                      {c.reservations.code(r.table_code)} ·{" "}
                      {r.reservation_mode !== "email" ? `${c.reservations.phone}${r.contact_phone ? ` ${r.contact_phone}` : ""}` : r.venue_notified_at ? c.reservations.notified(dateTime(r.venue_notified_at)) : c.reservations.notNotified}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Todo>

          <Todo
            title={c.evenings.title}
            count={today.evenings_to_resolve}
            tone={today.evenings_to_resolve ? "attention" : "calm"}
            footer={today.evenings_to_resolve ? <Link href="/admin/lokale/abende">{c.evenings.open}</Link> : undefined}
          >
            <p className={today.evenings_to_resolve ? "text-sm" : "muted text-sm"}>{today.evenings_to_resolve ? c.evenings.text(today.evenings_to_resolve) : c.evenings.empty}</p>
          </Todo>

          <Todo
            title={c.appeals.title}
            count={today.appeals.open}
            tone={today.appeals.open ? "attention" : "calm"}
            footer={today.appeals.open ? <Link href="/admin/sicherheit/widersprueche">{c.appeals.open}</Link> : undefined}
          >
            <p className={today.appeals.open ? "text-sm" : "muted text-sm"}>
              {today.appeals.open ? `${c.appeals.text(today.appeals.open)} ${today.appeals.oldest_at ? c.appeals.since(dateShort(today.appeals.oldest_at)) : ""}` : c.appeals.empty}
            </p>
          </Todo>
        </div>
        {today.next_period ? (
          <p className="muted text-sm">
            {c.nextPeriod(dateShort(today.next_period.starts_on), dateShort(today.next_period.ends_on), dateTime(today.next_period.answer_until))}
          </p>
        ) : null}
      </section>

      <section className="stack" aria-labelledby="kennzahlen">
        <div className="stack stack-sm">
          <h2 id="kennzahlen">{t.title}</h2>
          <p className="muted text-sm">
            {t.lead} {adminCommon.kNote(k)}
          </p>
        </div>
        <div className="kpi-grid">
          <section className="kpi" aria-labelledby="kpi-warteliste">
            <h3 className="kpi__title" id="kpi-warteliste">
              {t.waitlist}
            </h3>
            {kpis.waitlist ? (
              <>
                <Figures
                  items={[
                    { label: adminWaitlist.confirmed, value: kNum(kpis.waitlist.confirmed, k) },
                    { label: t.unconfirmed, value: kNum(kpis.waitlist.unconfirmed, k) },
                    { label: t.invitedToApp, value: kNum(kpis.waitlist.invited_to_app, k) },
                  ]}
                />
                <BarTable caption={t.waitlistByRegion} labelHeader={adminWaitlist.regionCols.group} valueHeader={adminWaitlist.confirmed} k={k}
                  rows={rowsOf(kpis.waitlist.by_region_group, adminWaitlist.groups, Object.keys(adminWaitlist.groups))} />
                <BarTable caption={t.waitlistBySource} labelHeader={adminWaitlist.sourceCols.source} valueHeader={adminWaitlist.confirmed} k={k}
                  rows={rowsOf(kpis.waitlist.by_source, {}).slice(0, 8)} />
              </>
            ) : (
              <p className="muted">{t.empty}</p>
            )}
            <Link href="/admin/warteliste" className="text-sm">{admin.nav.waitlist}</Link>
          </section>

          <section className="kpi" aria-labelledby="kpi-trichter">
            <h3 className="kpi__title" id="kpi-trichter">
              {t.funnel}
            </h3>
            <p className="muted text-sm">{t.funnelLead}</p>
            <BarTable caption={t.funnel} labelHeader={t.funnel} valueHeader={adminCommon.persons} k={k}
              rows={kpis.funnel.map((s) => ({ key: s.stage, label: t.stages[s.stage] ?? s.stage, value: s.n }))} />
          </section>

          <section className="kpi" aria-labelledby="kpi-lauf">
            <h3 className="kpi__title" id="kpi-lauf">
              {t.run}
            </h3>
            {kpis.last_run ? (
              <>
                <Figures
                  items={[
                    { label: t.pool, value: kNum(kpis.last_run.pool_size, k) },
                    { label: t.withProposal, value: kNum(kpis.last_run.persons_with_proposal, k) },
                    { label: t.share, value: kpis.last_run.matched_share === null ? adminCommon.kLess(k) : pct(kpis.last_run.matched_share, 0) },
                    { label: t.costPerRun, value: euro(kpis.last_run.cost_eur) },
                    { label: t.runtime, value: kpis.last_run.runtime_seconds === null ? "–" : `${num(kpis.last_run.runtime_seconds, 1)} s` },
                  ]}
                />
                <Link href={`/admin/auswahl/${kpis.last_run.id}`} className="text-sm">
                  {dateTime(kpis.last_run.finished_at)}
                </Link>
              </>
            ) : (
              <p className="muted">{t.noRun}</p>
            )}
          </section>

          <section className="kpi" aria-labelledby="kpi-abende">
            <h3 className="kpi__title" id="kpi-abende">
              {t.evenings}
            </h3>
            <Figures
              items={[
                { label: t.evTotal, value: kNum(kpis.evenings.total, k) },
                { label: t.evConfirmed, value: kNum(kpis.evenings.reached_confirmed, k) },
              ]}
            />
            {Object.keys(kpis.evenings.by_state).length ? (
              <BarTable caption={t.evenings} labelHeader={adminSafety.reports.cols.status} valueHeader={adminCommon.chartCount} k={k}
                rows={rowsOf(kpis.evenings.by_state, t.states, Object.keys(t.states))} />
            ) : null}
          </section>

          <section className="kpi" aria-labelledby="kpi-rueckmeldung">
            <h3 className="kpi__title" id="kpi-rueckmeldung">
              {t.feedback}
            </h3>
            <Figures
              items={[
                { label: t.fbCount, value: kNum(kpis.feedback.count, k) },
                { label: t.fbMatch, value: kpis.feedback.match_quality_avg === null ? "–" : num(kpis.feedback.match_quality_avg, 1) },
                { label: t.fbVenue, value: kpis.feedback.venue_rating_avg === null ? "–" : num(kpis.feedback.venue_rating_avg, 1) },
                { label: t.fbUnsafe, value: kNum(kpis.feedback.felt_unsafe, k) },
                { label: t.fbContact, value: kNum(kpis.feedback.contact_released, k) },
              ]}
            />
            <BarTable caption={t.fbAgain} labelHeader={t.fbAgain} valueHeader={adminCommon.chartCount} k={k}
              rows={rowsOf(kpis.feedback.would_meet_again, t.fbAgainValues, ["ja", "vielleicht", "nein"])} />
          </section>

          <section className="kpi" aria-labelledby="kpi-kosten">
            <h3 className="kpi__title" id="kpi-kosten">
              {t.costs}
            </h3>
            <Figures
              items={[
                { label: t.costPerSession, value: euro(kpis.costs.eur_per_session_median, 2) },
                {
                  label: `${t.costPerHour}${kpis.costs.target_eur_per_hour !== null ? ` (${t.costTarget(euro(kpis.costs.target_eur_per_hour))})` : ""}`,
                  value: euro(kpis.costs.eur_per_hour),
                },
                { label: t.costSessions, value: num(kpis.costs.sessions) },
                { label: t.costPerRun, value: euro(kpis.runs.cost_eur_avg) },
                { label: t.costPerProposal, value: euro(kpis.runs.cost_eur_per_proposal, 3) },
                { label: t.latency, value: kpis.costs.latency_p90_median_ms === null ? "–" : `${num(kpis.costs.latency_p90_median_ms)} ms` },
              ]}
            />
          </section>

          <section className="kpi" aria-labelledby="kpi-sicherheit">
            <h3 className="kpi__title" id="kpi-sicherheit">
              {t.safety}
            </h3>
            <Figures
              items={[
                { label: t.safetyDecided, value: kNum(kpis.safety.decided, k) },
                { label: t.safetyInTime, value: kpis.safety.in_time_share === null ? adminCommon.kLess(k) : pct(kpis.safety.in_time_share) },
                { label: t.safetyMedian, value: kpis.safety.median_hours_to_decision === null ? "–" : adminCommon.hours(Math.round(kpis.safety.median_hours_to_decision)) },
              ]}
            />
          </section>

          <section className="kpi" aria-labelledby="kpi-mitgliedschaft">
            <h3 className="kpi__title" id="kpi-mitgliedschaft">
              {t.membership}
            </h3>
            <BarTable caption={t.membership} labelHeader={t.membership} valueHeader={adminCommon.persons} k={k}
              rows={rowsOf(kpis.membership.by_status, t.membershipStatus, Object.keys(t.membershipStatus))} />
          </section>

          {o ? (
            <section className="kpi" aria-labelledby="kpi-bestand">
              <h3 className="kpi__title" id="kpi-bestand">
                {t.stock}
              </h3>
              <p className="muted text-sm">{t.stockLead}</p>
              <Figures
                items={[
                  { label: admin.dashboard.accounts, value: num(o.accounts_total) },
                  { label: `${admin.dashboard.invitations} ${admin.dashboard.open}`, value: num(o.invitations.open) },
                  { label: `${admin.dashboard.invitations} ${admin.dashboard.accepted}`, value: num(o.invitations.accepted) },
                  { label: admin.dashboard.pendingDeletion, value: num(o.verifications_pending_deletion) },
                ]}
              />
              <p className="cluster text-sm">
                <Link href="/admin/konten">{admin.nav.accounts}</Link>
                <Link href="/admin/pruefungen">{admin.nav.verifications}</Link>
              </p>
            </section>
          ) : null}
        </div>
      </section>
    </>
  );
}
