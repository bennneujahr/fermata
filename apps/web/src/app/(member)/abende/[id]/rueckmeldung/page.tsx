import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import "@/styles/gespraech-abende.css";
import { FeedbackForm } from "@/components/abende/FeedbackForm";
import { EmptyState, Notice, PageHeader } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { abende } from "@/copy/abende";
import { titles } from "@/copy/titles";
import { formatDeadline, formatWhen } from "@/lib/berlin";
import { getConsents, getLegalDocument, requireMember } from "@/lib/data";
import { eveningLinks } from "@/lib/evening-links";
import { getDbNow, getEveningDetail, hasPhone } from "@/lib/evenings";
import { Markdown } from "@/lib/markdown";

export const metadata: Metadata = { title: titles.abende };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Rückmeldung zum Abend (Link aus der Mail am nächsten Tag, 10 Uhr). Einmal je Person; das Gegenüber sieht sie nie.
export default async function FeedbackPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ form }, now, consents, phone] = await Promise.all([requireMember(`/abende/${id}/rueckmeldung`), getDbNow(), getConsents(), hasPhone()]);
  const c = abende(form);
  const d = UUID.test(id) ? await getEveningDetail(id) : null;
  if (!d) {
    return (
      <EmptyState title={c.notFoundTitle} headingLevel={2}>
        <p>{c.notFoundText}</p>
      </EmptyState>
    );
  }
  const links = eveningLinks(id);
  if (d.feedback.submitted) redirect(`${links.detail}?rueckmeldung=danke`);
  const consent = consents.find((k) => k.kind === "kontakttausch");
  const consentGranted = Boolean(consent?.granted && !consent.needs_renewal);
  const doc = consentGranted ? null : await getLegalDocument("kontakttausch");
  const notYet = d.starts_at && new Date(d.starts_at).getTime() > now.getTime();
  return (
    <div className="stack stack-lg">
      <p>
        <Link href={links.detail} className="cluster back-link">
          <Icon name="arrowLeft" size={18} />
          {c.withName(d.counterpart_first_name)}
        </Link>
      </p>
      <PageHeader title={c.feedbackTitle} lead={c.feedbackLead}>
        {d.feedback.open && d.feedback.open_until ? <p className="muted text-sm">{c.feedbackOpenUntil(formatDeadline(d.feedback.open_until, now))}</p> : null}
      </PageHeader>
      {d.feedback.open ? (
        <FeedbackForm
          eveningId={id}
          form={form}
          counterpartName={d.counterpart_first_name}
          hasPhone={phone}
          consentGranted={consentGranted}
          consentVersion={doc?.version ?? null}
          consentDoc={
            doc ? (
              <div className="doc-box" tabIndex={0} role="region" aria-label={doc.title}>
                <Markdown source={doc.body_markdown} />
              </div>
            ) : null
          }
          reportHref={links.report}
        />
      ) : (
        <Notice tone="info">{notYet && d.starts_at ? c.feedbackNotYet(formatWhen(d.starts_at, now)) : c.feedbackClosed}</Notice>
      )}
    </div>
  );
}
