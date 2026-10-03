import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Notice } from "@/components/ui";
import { status } from "@/copy/common";
import { consentStep } from "@/copy/onboarding";
import { getConsents, getLegalDocument, requireMember } from "@/lib/data";
import { Markdown } from "@/lib/markdown";
import { OnboardingHeader } from "../OnboardingHeader";
import { ConsentForm } from "./ConsentForm";

export const metadata: Metadata = { title: "Einwilligungen" };

// Einwilligungen einzeln, in der Reihenfolge aus account.required_consents (art9_profile vor dem Formular).
export default async function ConsentStepPage() {
  const [{ overview, form }, consents] = await Promise.all([requireMember("/onboarding/einwilligungen"), getConsents()]);
  const required = consents.filter((k) => k.required);
  const open = required.find((k) => !k.granted);
  if (!open) redirect("/onboarding");
  const doc = await getLegalDocument(open.kind);
  const c = consentStep(form);
  const index = required.indexOf(open);
  return (
    <div className="stack stack-lg">
      <OnboardingHeader onboarding={overview.onboarding} current="einwilligungen" form={form} />
      <header className="stack stack-sm">
        <p className="eyebrow">{c.progress(index + 1, required.length)}</p>
        <h1>{doc?.title ?? c.title}</h1>
        {index === 0 ? <p className="lead">{c.lead}</p> : null}
      </header>
      {doc ? (
        <>
          {doc.status === "entwurf" ? <Notice tone="draft">{status.draftLong}</Notice> : null}
          <section className="doc-box" aria-label={doc.title} tabIndex={0}>
            <Markdown source={doc.body_markdown} />
          </section>
          <p className="muted text-sm">{c.version(doc.version)}</p>
          <ConsentForm kind={open.kind} version={doc.version} label={c.checkbox[open.kind] ?? doc.title} form={form} />
          <p className="muted text-sm">{c.why}</p>
        </>
      ) : (
        <Notice tone="warning">{c.missingDoc}</Notice>
      )}
    </div>
  );
}
