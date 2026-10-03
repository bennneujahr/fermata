// Kündigungsknopf (§ 312k BGB), angemeldet. Einstieg „Verträge hier kündigen“ auf /mitgliedschaft und im Fuß jeder Seite.
import type { Metadata } from "next";
import Link from "next/link";
import { CancelForm } from "@/components/mitgliedschaft/CancelForm";
import { Notice, PageHeader } from "@/components/ui";
import { errors } from "@/copy/common";
import { cancel as cancelCopy, titles } from "@/copy/mitgliedschaft";
import { getCancelPreview } from "@/lib/billing";
import { requireMember } from "@/lib/data";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: titles.cancel };
export const dynamic = "force-dynamic";

export default async function CancelPage() {
  const { form } = await requireMember("/mitgliedschaft/kuendigen");
  const c = cancelCopy(form);
  const result = await getCancelPreview();
  return (
    <div className="stack stack-lg">
      <p>
        <Link href="/mitgliedschaft">{c.back}</Link>
      </p>
      <PageHeader title={c.title} lead={c.lead} />
      <Notice tone="draft">{c.draft}</Notice>
      {"error" in result ? (
        <Notice tone="warning">{errors.generic(form)}</Notice>
      ) : !result.preview.possible ? (
        <Notice tone="info" title={c.notPossibleTitle}>
          <p>{c.notPossible[result.preview.reason ?? "no_contract"] ?? c.notPossible.no_contract}</p>
          {result.preview.reason === "already_cancelled" && result.preview.effective_at ? (
            <p>{c.alreadyCancelledUntil(formatDate(result.preview.effective_at))}</p>
          ) : null}
        </Notice>
      ) : (
        <CancelForm form={form} preview={result.preview} />
      )}
    </div>
  );
}
