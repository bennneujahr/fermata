// Widerrufsbutton (§ 356a BGB), angemeldet. Einstieg „Vertrag widerrufen“ auf /mitgliedschaft (während der Frist).
import type { Metadata } from "next";
import Link from "next/link";
import { WithdrawForm } from "@/components/mitgliedschaft/WithdrawForm";
import { ButtonLink, Notice, PageHeader } from "@/components/ui";
import { errors } from "@/copy/common";
import { titles, withdraw as withdrawCopy } from "@/copy/mitgliedschaft";
import { getWithdrawPreview } from "@/lib/billing";
import { requireMember } from "@/lib/data";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: titles.withdraw };
export const dynamic = "force-dynamic";

export default async function WithdrawPage() {
  const { form } = await requireMember("/mitgliedschaft/widerrufen");
  const c = withdrawCopy(form);
  const result = await getWithdrawPreview();
  const p = "error" in result ? null : result.preview;
  return (
    <div className="stack stack-lg">
      <p>
        <Link href="/mitgliedschaft">{c.back}</Link>
      </p>
      <PageHeader title={c.title} />
      {!p?.possible ? <Notice tone="draft">{c.draft}</Notice> : null}
      {!p ? (
        <Notice tone="warning">{errors.generic(form)}</Notice>
      ) : !p.possible ? (
        <Notice tone="info" title={c.notPossibleTitle}>
          <p>{c.notPossible[p.reason ?? "no_contract"] ?? c.notPossible.no_contract}</p>
          {p.reason === "period_over" ? (
            <p>
              <ButtonLink href="/mitgliedschaft/kuendigen" variant="secondary" size="sm">
                {c.toCancel}
              </ButtonLink>
            </p>
          ) : null}
        </Notice>
      ) : (
        <WithdrawForm
          form={form}
          preview={p}
          intro={
            <div className="stack stack-sm">
              {p.until ? <p className="lead measure">{c.lead(formatDate(p.until))}</p> : null}
              <Notice tone="draft">{c.draft}</Notice>
            </div>
          }
        />
      )}
    </div>
  );
}
