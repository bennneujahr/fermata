import type { Metadata } from "next";
import Link from "next/link";
import "@/styles/gespraech-abende.css";
import { getSummaryAction } from "@/app/actions/gespraech";
import { SummaryReview } from "@/components/gespraech/SummaryReview";
import { Card, PageHeader } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { gespraech, summary as summaryCopy } from "@/copy/gespraech";
import { titles } from "@/copy/titles";
import { requireMember } from "@/lib/data";
import { formatDate } from "@/lib/format";
import { getInterviewSession, getProfileSummary, getTranscript } from "@/lib/gespraech";

export const metadata: Metadata = { title: titles.zusammenfassung };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { form } = await requireMember(`/gespraech/${id}`);
  const c = summaryCopy(form);
  const g = gespraech(form);
  const session = UUID.test(id) ? await getInterviewSession(id) : null;
  if (!session) {
    return (
      <div className="stack stack-lg">
        <p>
          <Link href="/gespraech">{c.back}</Link>
        </p>
        <PageHeader title={c.errors.session_not_found!} />
      </div>
    );
  }
  const [summaryRes, transcript, profile] = await Promise.all([getSummaryAction(id), getTranscript(id), getProfileSummary()]);
  const initial = summaryRes.ok
    ? summaryRes.data
    : {
        session_id: id,
        kind: session.kind,
        status: session.status,
        summary_status: session.summary_status,
        summary_draft: session.summary_draft,
        summary_confirmed_at: null,
        covered_blocks: session.covered_blocks,
        end_reason: session.end_reason,
        address_form: form,
        analysis_status: "none" as const,
        summary_version: null,
      };
  const confirmedAt = initial.summary_confirmed_at ?? profile?.summary_confirmed_at ?? null;
  return (
    <div className="stack stack-lg">
      <p>
        <Link href="/gespraech" className="cluster back-link">
          <Icon name="arrowLeft" size={18} />
          {c.back}
        </Link>
      </p>
      <PageHeader
        eyebrow={c.meta(g.kindNames[session.kind] ?? session.kind, formatDate(session.created_at), g.historyMode[session.mode] ?? session.mode)}
        title={c.title}
        lead={c.lead}
      />
      <Card id="entwurf">
        <SummaryReview initial={initial} form={form} confirmedAt={confirmedAt ? formatDate(confirmedAt) : null} />
      </Card>
      {transcript ? (
        <details className="card card--sunk transcript" id="gespraechstext">
          <summary>
            <span className="card__title">{c.transcriptTitle}</span>
          </summary>
          <p className="muted text-sm">{c.transcriptLead(formatDate(transcript.delete_at))}</p>
          {transcript.turns.length ? (
            <ol className="list-plain transcript__list">
              {transcript.turns.map((t, i) => (
                <li key={i} className={`transcript__turn transcript__turn--${t.role}`}>
                  <span className="transcript__speaker">{t.role === "viola" ? c.speakerViola : c.speakerMe}</span>
                  <p>{t.text}</p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="muted">{c.transcriptEmpty}</p>
          )}
        </details>
      ) : null}
    </div>
  );
}
