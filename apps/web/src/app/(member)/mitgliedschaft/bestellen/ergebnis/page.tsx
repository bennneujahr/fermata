// Ergebnis der Bestellung (auch Rücksprung von Stripe, z. B. nach 3-D Secure: ?redirect_status=succeeded|processing|failed).
import type { Metadata } from "next";
import { orderHref } from "@/components/mitgliedschaft/TierCards";
import { Badge, ButtonLink, buttonClass, Card, PageHeader } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { orderResult, statusLabels, titles } from "@/copy/mitgliedschaft";
import { getBillingOverview } from "@/lib/billing";
import { requireMember } from "@/lib/data";
import { formatReceipt } from "@/lib/datetime";
import { formatDate } from "@/lib/format";
import "@/components/mitgliedschaft/mitgliedschaft.css";

export const metadata: Metadata = { title: titles.result };

export default async function OrderResultPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const { form } = await requireMember("/mitgliedschaft/bestellen/ergebnis");
  const c = orderResult(form);
  const overview = await getBillingOverview().catch(() => null);
  const redirect = typeof sp.redirect_status === "string" ? sp.redirect_status : null;
  const status = overview?.status ?? "free";
  const failed = redirect === "failed" || (redirect !== "succeeded" && redirect !== "processing" && status !== "pending" && status !== "active");
  const processing = redirect === "processing";
  const active = status === "active";

  if (failed) {
    return (
      <div className="stack stack-lg">
        <PageHeader title={c.failedTitle} lead={c.failedText} />
        <div className="cluster">
          {overview?.tier ? (
            // Ganzer Seitenaufruf: die Bestellseite braucht ihre eigene CSP (Stripe).
            <a href={orderHref(overview.tier)} className={buttonClass({})}>
              <span>{c.retry}</span>
            </a>
          ) : null}
          <ButtonLink href="/mitgliedschaft" variant="secondary">
            {c.toMembership}
          </ButtonLink>
        </div>
      </div>
    );
  }

  return (
    <div className="stack stack-lg">
      <PageHeader title={active ? c.activeTitle : processing ? c.processingTitle : c.successTitle} />
      <Card className="receipt">
        <div className="receipt__head">
          <Icon name="checkCircle" size={30} />
          <p className="lead">{active ? c.activeText : processing ? c.processingText : c.successText}</p>
        </div>
        {overview ? (
          <dl className="facts">
            <dt>{c.labels.status}</dt>
            <dd>
              <Badge tone={active ? "success" : "warning"}>{statusLabels[status] ?? status}</Badge>
            </dd>
            {overview.contract_number ? (
              <>
                <dt>{c.labels.contract}</dt>
                <dd>{overview.contract_number}</dd>
              </>
            ) : null}
            {overview.ordered_at ? (
              <>
                <dt>{c.labels.orderedAt}</dt>
                <dd className="receipt__time">{formatReceipt(overview.ordered_at)}</dd>
              </>
            ) : null}
            {overview.withdrawal.until ? (
              <>
                <dt>{c.labels.withdrawUntil}</dt>
                <dd>{formatDate(overview.withdrawal.until)}</dd>
              </>
            ) : null}
          </dl>
        ) : null}
      </Card>
      <div>
        <ButtonLink href="/mitgliedschaft" iconAfter="arrowRight">
          {c.toMembership}
        </ButtonLink>
      </div>
    </div>
  );
}
