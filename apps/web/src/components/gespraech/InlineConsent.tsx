// Einwilligung direkt dort erteilen, wo sie gebraucht wird (Gespräch, Mitteilungen, Kontakt teilen).
// Zeigt den aktuellen Text (ops.legal_documents) und nutzt dieselbe Aktion wie das Onboarding.
import Link from "next/link";
import { ConsentForm } from "@/app/onboarding/einwilligungen/ConsentForm";
import { Notice } from "@/components/ui";
import { status } from "@/copy/common";
import type { AddressForm } from "@/copy/form";
import { getLegalDocument } from "@/lib/data";
import { Markdown } from "@/lib/markdown";

export async function InlineConsent({
  kind,
  form,
  label,
  returnTo,
  title,
  lead,
  readLabel,
  headingLevel = 2,
}: {
  kind: string;
  form: AddressForm;
  label: string;
  returnTo: string;
  title: string;
  lead?: string;
  readLabel: string;
  headingLevel?: 2 | 3;
}) {
  const doc = await getLegalDocument(kind);
  const H = `h${headingLevel}` as "h2" | "h3";
  return (
    <section className="card card--accent inline-consent" aria-labelledby={`einwilligung-${kind}`}>
      <H className="card__title" id={`einwilligung-${kind}`}>
        {title}
      </H>
      {lead ? <p className="soft">{lead}</p> : null}
      {doc ? (
        <>
          {doc.status === "entwurf" ? <Notice tone="draft">{status.draftLong}</Notice> : null}
          <details className="inline-consent__doc">
            <summary>{readLabel}</summary>
            <div className="doc-box" tabIndex={0} role="region" aria-label={doc.title}>
              <Markdown source={doc.body_markdown} />
            </div>
            <p className="muted text-sm">
              <Link href={`/rechtliches/${kind}`}>{doc.title}</Link>
            </p>
          </details>
          <ConsentForm kind={kind} version={doc.version} label={label} form={form} returnTo={returnTo} />
        </>
      ) : null}
    </section>
  );
}
