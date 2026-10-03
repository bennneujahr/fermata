// Rechtstexte aus api.legal_document(kind): impressum, datenschutz, agb, widerruf, ki_hinweis und die Einwilligungstexte.
// Markdown ohne HTML (lib/markdown). Status „entwurf“ → deutlicher ENTWURF-Hinweis.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Notice, PageHeader } from "@/components/ui";
import { status } from "@/copy/common";
import { legal } from "@/copy/rechtliches";
import { getLegalDocument } from "@/lib/data";
import { formatDate } from "@/lib/format";
import { Markdown } from "@/lib/markdown";

export async function generateMetadata({ params }: { params: Promise<{ art: string }> }): Promise<Metadata> {
  const { art } = await params;
  return { title: legal.kinds[art] ?? legal.title };
}

export default async function LegalPage({ params }: { params: Promise<{ art: string }> }) {
  const { art } = await params;
  if (!legal.kinds[art]) notFound();
  const doc = await getLegalDocument(art).catch(() => null);
  const draft = !doc || doc.status === "entwurf";
  return (
    <div className="stack stack-lg">
      <p>
        <Link href="/rechtliches">{legal.back}</Link>
      </p>
      <PageHeader
        title={doc?.title ?? legal.kinds[art]}
        eyebrow={doc ? legal.version(doc.version) : undefined}
        lead={doc?.valid_from && !draft ? legal.validFrom(formatDate(doc.valid_from)) : undefined}
      />
      {draft ? (
        <Notice tone="draft" title={legal.draftTitle}>
          {status.draftLong}
        </Notice>
      ) : null}
      {doc ? <Markdown source={doc.body_markdown} /> : <p className="muted">{legal.missingDraft}</p>}
    </div>
  );
}
