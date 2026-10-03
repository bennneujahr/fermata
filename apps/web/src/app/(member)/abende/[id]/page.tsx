import type { Metadata } from "next";
import Link from "next/link";
import "@/styles/gespraech-abende.css";
import { ContactResult } from "@/components/abende/ContactResult";
import { EndEvening } from "@/components/abende/EndEvening";
import { FindCard } from "@/components/abende/FindCard";
import { HintForm } from "@/components/abende/HintForm";
import { SafetyCard } from "@/components/abende/SafetyCard";
import { TimeAnswer } from "@/components/abende/TimeAnswer";
import { TimePicker } from "@/components/abende/TimePicker";
import { VenueCard } from "@/components/abende/VenueCard";
import { Badge, ButtonLink, Card, Notice, PageHeader } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { abende } from "@/copy/abende";
import { titles } from "@/copy/titles";
import { formatDeadline, formatEveningTime, formatRelative, isoUtc } from "@/lib/berlin";
import { requireMember } from "@/lib/data";
import { eveningLinks } from "@/lib/evening-links";
import { offeredTimes, type EveningDetail } from "@/lib/evening-types";
import { getDbNow, getEveningDetail, getFindInfo } from "@/lib/evenings";

export const metadata: Metadata = { title: titles.abende };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function myTimes(d: EveningDetail): string[] {
  if (d.state === "time_requested" && d.requested_by_me) return d.requested_times;
  if (d.state === "time_countered" && d.countered_by_me) return d.countered_times;
  return [];
}

export default async function EveningPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ rueckmeldung?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const [{ form }, now] = await Promise.all([requireMember(`/abende/${id}`), getDbNow()]);
  const c = abende(form);
  const d = UUID.test(id) ? await getEveningDetail(id) : null;
  if (!d) {
    return (
      <div className="stack stack-lg">
        <p>
          <Link href="/abende">{c.back}</Link>
        </p>
        <PageHeader title={c.notFoundTitle} lead={c.notFoundText} />
      </div>
    );
  }
  const links = eveningLinks(d.evening_id);
  const name = d.counterpart_first_name;
  const nowIso = isoUtc(now);
  const action = d.my_action;
  const findInfo = action === "find" ? await getFindInfo(d.evening_id) : null;
  const proposal = d.state === "proposed" || d.state === "time_requested" || d.state === "time_countered";
  const confirmed = d.state === "confirmed";
  const started = Boolean(d.starts_at && new Date(d.starts_at).getTime() <= now.getTime());
  const lateFrom = d.late_cancel_from ? new Date(d.late_cancel_from) : null;
  const cancelExplanation =
    lateFrom && now.getTime() < lateFrom.getTime()
      ? [c.cancelEarly(formatRelative(lateFrom, now)), c.cancelLateFuture(formatRelative(lateFrom, now))]
      : [c.cancelLate];

  const deadline = d.my_deadline_at ? formatDeadline(d.my_deadline_at, now) : null;
  const ended = ["declined", "lapsed", "cancelled_early", "cancelled_late"].includes(d.state);

  return (
    <div className="stack stack-lg evening-detail" data-state={d.state} data-action={action}>
      <p>
        <Link href="/abende" className="cluster back-link">
          <Icon name="arrowLeft" size={18} />
          {c.back}
        </Link>
      </p>
      <PageHeader
        eyebrow={c.states[d.state] ?? d.state}
        title={proposal ? c.proposalWith(name) : c.withName(name)}
        lead={proposal ? (deadline ? c.deadlineNote(deadline) : undefined) : d.starts_at && action !== "prepare" ? formatEveningTime(d.starts_at, now) : undefined}
      >
        {d.venue?.name ? (
          <p className="cluster soft venue-line">
            <Icon name="evening" size={18} />
            {c.at(d.venue.name, d.venue.city)}
          </p>
        ) : null}
      </PageHeader>

      {sp.rueckmeldung === "danke" ? (
        <Notice tone="success" live="polite">
          {c.feedbackThanks}
        </Notice>
      ) : null}

      {/* Nächster Schritt je my_action */}
      {action === "choose_time" ? (
        <Card title={c.chooseTitle} eyebrow={c.stepTitle} variant="accent" id="schritt">
          <p className="soft" id="wahl-hinweis">
            {c.chooseLead(d.max_times_per_answer)}
          </p>
          {deadline ? <p className="deadline">{c.deadlineNoteShort(deadline)}</p> : null}
          <TimePicker eveningId={d.evening_id} form={form} options={d.time_options} max={d.max_times_per_answer} mode="request" legendId="wahl-hinweis" />
          <div className="card__footer">
            <EndEvening eveningId={d.evening_id} form={form} kind="decline" counterpartName={name} reportHref={links.report} />
          </div>
        </Card>
      ) : null}

      {action === "answer_time" ? (
        <Card title={c.answerTitle(name)} eyebrow={c.stepTitle} variant="accent" id="schritt">
          <p className="soft">{c.answerLead}</p>
          {deadline ? <p className="deadline">{c.deadlineNoteShort(deadline)}</p> : null}
          <TimeAnswer
            eveningId={d.evening_id}
            form={form}
            offered={offeredTimes(d)}
            options={d.time_options}
            max={d.max_times_per_answer}
            roundsLeft={d.rounds_left}
            now={nowIso}
          />
          <div className="card__footer">
            <EndEvening eveningId={d.evening_id} form={form} kind="decline" counterpartName={name} reportHref={links.report} />
          </div>
        </Card>
      ) : null}

      {action === "wait" ? (
        <Card title={c.waitTitle(name)} eyebrow={c.stepTitle} id="schritt">
          <p className="soft">{c.waitText(null)}</p>
          {myTimes(d).length ? (
            <div className="stack stack-sm">
              <p className="fieldset__legend">{c.yourTimes}</p>
              <ul className="list-plain cluster">
                {myTimes(d).map((t) => (
                  <li key={t}>
                    <Badge>{formatEveningTime(t, now)}</Badge>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="card__footer">
            <EndEvening eveningId={d.evening_id} form={form} kind="decline" counterpartName={name} reportHref={links.report} />
          </div>
        </Card>
      ) : null}

      {confirmed && d.starts_at && action === "prepare" ? (
        <Card title={c.confirmedTitle} eyebrow={c.stepTitle} variant="accent" id="schritt">
          <p className="evening-when">
            <Icon name="clock" size={22} />
            <span>{formatEveningTime(d.starts_at, now)}</span>
          </p>
          {d.reservation ? (
            <dl className="facts">
              <dt>{c.reservationLabel}</dt>
              <dd>{c.reservationValue(d.reservation.name, d.reservation.persons)}</dd>
              <dt>{c.tableCode}</dt>
              <dd>
                <span className="table-code">{d.reservation.table_code}</span>
              </dd>
            </dl>
          ) : null}
          {d.reservation ? <p className="muted text-sm">{c.tableCodeHint}</p> : null}
        </Card>
      ) : null}

      {action === "find" && findInfo ? <FindCard info={findInfo} form={form} href={links.find} /> : null}

      {action === "feedback" ? (
        <Card title={c.feedbackTitle} eyebrow={c.stepTitle} variant="accent" id="schritt">
          <p className="soft">{c.feedbackLead}</p>
          {d.feedback.open_until ? <p className="muted text-sm">{c.feedbackOpenUntil(formatDeadline(d.feedback.open_until, now))}</p> : null}
          <div>
            <ButtonLink href={links.feedback} iconAfter="arrowRight">
              {c.feedbackCta}
            </ButtonLink>
          </div>
        </Card>
      ) : null}

      {d.contact_share && d.contact_share.status !== "none" ? <ContactResult share={d.contact_share} form={form} name={name} /> : null}

      {d.debrief?.eligible ? (
        <Card title={c.debriefTitle} id="nachbesprechung" variant={action === "debrief" ? "accent" : "outline"}>
          <p className="soft">{c.debriefText(d.debrief.minutes, d.debrief.offer_until ? formatDeadline(d.debrief.offer_until, now) : "")}</p>
          <div>
            <ButtonLink href={links.debrief} icon="voice">
              {c.debriefCta}
            </ButtonLink>
          </div>
        </Card>
      ) : d.debrief?.reason === "done" ? (
        <p className="muted">{c.debriefDone}</p>
      ) : null}

      {ended ? (
        <Card id="ende" variant="sunk">
          <p className="soft">
            {d.state === "declined"
              ? c.endedDeclined(d.cancelled_by_me)
              : d.state === "lapsed"
                ? c.endedLapsed
                : c.endedCancelled(d.cancelled_by_me)}
          </p>
          <p className="muted">{c.endedNext}</p>
        </Card>
      ) : null}

      {/* Vorschlag: warum, wo */}
      {d.reasons_text && !ended ? (
        <Card title={c.whyTitle} id="warum" variant="sunk">
          <p className="why-text">{d.reasons_text}</p>
        </Card>
      ) : null}

      {d.venue ? <VenueCard venue={d.venue} form={form} /> : null}

      {confirmed && !started ? (
        <Card title={c.hintTitle} id="erkennungszeichen">
          <p className="soft">{c.hintLead(name)}</p>
          <HintForm eveningId={d.evening_id} form={form} initial={d.my_recognition_hint} />
        </Card>
      ) : null}

      {(confirmed || d.state === "happened" || d.state === "no_show") && d.starts_at ? (
        <SafetyCard form={form} links={links} showCheckin={confirmed} showShare={confirmed && !(d.find_window && now.getTime() > new Date(d.find_window.closes_at).getTime())} />
      ) : null}

      {confirmed && !started ? (
        <section className="stack stack-sm cancel-area" aria-label={c.cancelTitle}>
          <p className="muted text-sm">{cancelExplanation[0]}</p>
          <div>
            <EndEvening eveningId={d.evening_id} form={form} kind="cancel" counterpartName={name} explanation={cancelExplanation} reportHref={links.report} />
          </div>
        </section>
      ) : null}

    </div>
  );
}
