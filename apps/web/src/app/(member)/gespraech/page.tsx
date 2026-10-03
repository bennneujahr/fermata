import type { Metadata } from "next";
import Link from "next/link";
import "@/styles/gespraech-abende.css";
import { Conversation } from "@/components/gespraech/Conversation";
import { InlineConsent } from "@/components/gespraech/InlineConsent";
import { Badge, ButtonLink, Card, PageHeader } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { gespraech } from "@/copy/gespraech";
import { titles } from "@/copy/titles";
import { formatWhen } from "@/lib/berlin";
import { getConsents, requireMember } from "@/lib/data";
import { getDbNow, getEveningDetail } from "@/lib/evenings";
import { formatDate } from "@/lib/format";
import { continuableSession, getInterviewSessions, getProfileSummary, getTier, getTranscriptDeletion, KINDS_BY_TIER, openSession, voiceSetup } from "@/lib/gespraech";
import { onboardingPath } from "@/lib/routes";
import { INTERVIEW_KINDS, type InterviewKind } from "@/lib/viola/types";

export const metadata: Metadata = { title: titles.gespraech };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ConversationPage({ searchParams }: { searchParams: Promise<{ art?: string; abend?: string }> }) {
  const sp = await searchParams;
  const [{ overview, form }, consents, sessions, deletion, profile, tier, now] = await Promise.all([
    requireMember("/gespraech"),
    getConsents(),
    getInterviewSessions(),
    getTranscriptDeletion(),
    getProfileSummary(),
    getTier(),
    getDbNow(),
  ]);
  const c = gespraech(form);
  const o = overview.onboarding;
  const verified = Boolean(o.verification?.verified);
  const consentOk = consents.some((k) => k.kind === "gespraech" && k.granted && !k.needs_renewal);
  const hasSummary = Boolean(profile?.summary_confirmed_at);
  const allowed = KINDS_BY_TIER[tier];

  const requested = INTERVIEW_KINDS.includes(sp.art as InterviewKind) ? (sp.art as InterviewKind) : null;
  const eveningId = requested === "nachbesprechung" && sp.abend && UUID.test(sp.abend) ? sp.abend : null;
  let kind: InterviewKind = hasSummary ? (allowed.includes("vertiefung") ? "vertiefung" : "korrektur") : "erstgespraech";
  if (requested && (requested !== "nachbesprechung" || eveningId)) kind = requested;
  if (!hasSummary && (kind === "vertiefung" || kind === "korrektur")) kind = "erstgespraech";

  let debriefLead: string | null = null;
  if (kind === "nachbesprechung" && eveningId) {
    const detail = await getEveningDetail(eveningId).catch(() => null);
    if (detail?.starts_at) debriefLead = c.debriefLead(formatWhen(detail.starts_at, now), detail.debrief?.minutes ?? 10);
  }

  const voice = voiceSetup();
  const open = openSession(sessions);
  const cont = continuableSession(sessions, now);
  const query = new URLSearchParams();
  if (requested) query.set("art", requested);
  if (eveningId) query.set("abend", eveningId);
  const self = `/gespraech${query.size ? `?${query}` : ""}`;
  const choices = hasSummary ? allowed.filter((k) => k !== "erstgespraech" && k !== "nachbesprechung") : [];
  const history = sessions.filter((s) => s.status !== "aborted" && s.status !== "requested");

  const intro = (
    <Card id="art" title={c.kinds[kind]?.title} eyebrow={c.kindTitle}>
      <p className="soft">{debriefLead ?? c.kinds[kind]?.text}</p>
      {choices.length > 1 && kind !== "nachbesprechung" ? (
        <nav aria-label={c.kindTitle}>
          <ul className="list-plain cluster">
            {choices.map((k) => (
              <li key={k}>
                <Link href={`/gespraech?art=${k}`} aria-current={k === kind ? "page" : undefined} className="kind-link">
                  {c.kinds[k]?.title}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
      <p className="muted text-sm">
        {c.addressNote} <Link href="/konto#anrede">{c.addressLink}</Link>
      </p>
    </Card>
  );

  return (
    <div className="stack stack-lg">
      <PageHeader eyebrow={c.eyebrow} title={c.title} lead={c.lead} />

      {!verified ? (
        <Card title={c.notVerifiedTitle} variant="accent" id="einrichten">
          <p className="soft">{c.notVerifiedText}</p>
          <div>
            <ButtonLink href={onboardingPath(o.next_step ?? "einwilligungen")} iconAfter="arrowRight">
              {c.notVerifiedCta}
            </ButtonLink>
          </div>
        </Card>
      ) : !consentOk ? (
        <InlineConsent kind="gespraech" form={form} label={c.consentAgree} returnTo={self} title={c.consentTitle} lead={c.consentLead} readLabel={c.consentRead} />
      ) : (
        <Conversation
          form={form}
          kind={kind}
          eveningId={eveningId}
          voice={voice}
          openSessionId={open?.id ?? null}
          continueSession={cont && cont.kind === kind ? { id: cont.id, mode: cont.mode } : null}
          intro={intro}
        />
      )}

      <div className="grid-auto">
        <Card title={c.aboutTitle} id="viola" variant="sunk">
          <ul className="list-plain stack stack-sm">
            {c.about.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <p>
            <Link href="/rechtliches/ki_hinweis">{c.aiNoteLink}</Link>
          </p>
        </Card>
        <Card title={c.factsTitle} id="daten" variant="sunk">
          <ul className="list-check list-plain stack stack-sm">
            {c.facts.map((f) => (
              <li key={f}>
                <Icon name="check" size={18} />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card title={c.profileTitle} id="zusammenfassung">
        {profile?.summary_text ? (
          <>
            <blockquote className="summary-quote">{profile.summary_text}</blockquote>
            {profile.summary_confirmed_at ? <p className="muted text-sm">{c.profileConfirmed(formatDate(profile.summary_confirmed_at))}</p> : null}
          </>
        ) : (
          <p className="muted">{c.profileNone}</p>
        )}
      </Card>

      <Card title={c.historyTitle} id="verlauf">
        {history.length ? (
          <ul className="list-plain list-divided history">
            {history.map((s) => {
              const del = deletion.get(s.id);
              return (
                <li key={s.id} className="history__item">
                  <div className="stack stack-sm">
                    <p className="history__title">
                      <strong>{c.kindNames[s.kind] ?? s.kind}</strong> <span className="muted">· {formatDate(s.created_at)} · {c.historyMode[s.mode]}</span>
                    </p>
                    <div className="cluster">
                      <Badge tone={s.status === "completed" ? "success" : s.status === "active" ? "brass" : undefined}>{c.historyStatus[s.status] ?? s.status}</Badge>
                      <Badge tone={s.summary_status === "draft" ? "wine" : undefined}>{c.summaryStatus[s.summary_status] ?? s.summary_status}</Badge>
                    </div>
                    <p className="muted text-sm">{del ? c.transcriptUntil(formatDate(del)) : c.transcriptGone}</p>
                  </div>
                  <ButtonLink href={`/gespraech/${s.id}`} variant="secondary" size="sm" iconAfter="arrowRight">
                    {c.open}
                  </ButtonLink>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="muted">{c.historyEmpty}</p>
        )}
      </Card>
    </div>
  );
}
