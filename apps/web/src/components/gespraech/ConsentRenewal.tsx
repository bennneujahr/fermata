// Ruhiger Hinweis, wenn es eine neue Fassung einer erteilten Einwilligung gibt (needs_renewal).
// Die bisherige Einwilligung gilt weiter; neu bestätigen ist ein Angebot, kein Hindernis.
import { ConsentForm } from "@/app/onboarding/einwilligungen/ConsentForm";
import { Notice } from "@/components/ui";
import { renewal } from "@/copy/gespraech";
import type { AddressForm } from "@/copy/form";
import { getLegalDocument } from "@/lib/data";
import { Markdown } from "@/lib/markdown";

export async function ConsentRenewal({ kind, form, returnTo, name }: { kind: string; form: AddressForm; returnTo: string; name: string }) {
  const doc = await getLegalDocument(kind);
  if (!doc) return null;
  const c = renewal(form);
  return (
    <Notice tone="info" title={c.title(name)}>
      <p>{c.text}</p>
      <details className="inline-consent__doc">
        <summary>{c.open}</summary>
        <div className="stack stack-sm">
          <div className="doc-box" tabIndex={0} role="region" aria-label={doc.title}>
            <Markdown source={doc.body_markdown} />
          </div>
          <ConsentForm kind={kind} version={doc.version} label={c.agree} form={form} returnTo={returnTo} />
        </div>
      </details>
    </Notice>
  );
}
