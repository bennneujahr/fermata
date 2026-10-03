import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Notice, PageHeader } from "@/components/ui";
import { status } from "@/copy/common";
import { legal } from "@/copy/help";
import { getLegalDocument } from "@/lib/data";
import { Markdown } from "@/lib/markdown";

export async function generateMetadata({ params }: { params: Promise<{ art: string }> }): Promise<Metadata> {
  const { art } = await params;
  return { title: legal.kinds[art] ?? legal.title };
}

export default async function LegalPage({ params }: { params: Promise<{ art: string }> }) {
  const { art } = await params;
  if (!legal.kinds[art]) notFound();
  const doc = await getLegalDocument(art);
  return (
    <div className="stack stack-lg">
      <p>
        <Link href="/rechtliches">{legal.back}</Link>
      </p>
      <PageHeader title={doc?.title ?? legal.kinds[art]} eyebrow={doc ? legal.version(doc.version) : undefined} />
      {doc?.status === "entwurf" ? <Notice tone="draft">{status.draftLong}</Notice> : null}
      {doc ? <Markdown source={doc.body_markdown} /> : <p className="muted">{legal.missing}</p>}
    </div>
  );
}
