// Bestellübersicht mit allen Pflichtangaben (§ 312j Abs. 2 BGB), Payment Element, Pflicht-Häkchen und Bestellknopf.
// Nur unter /mitgliedschaft/bestellen erlaubt die CSP Stripe (src/proxy.ts).
import type { Metadata } from "next";
import Link from "next/link";
import { OrderForm } from "@/components/mitgliedschaft/OrderForm";
import { Badge, ButtonLink, Card, EmptyState, PageHeader } from "@/components/ui";
import { order as orderCopy, titles } from "@/copy/mitgliedschaft";
import { getBillingOverview, getOrderSummary, hasRunningMembership } from "@/lib/billing";
import { requireMember } from "@/lib/data";

export const metadata: Metadata = { title: titles.order };

export default async function OrderPage({ params }: { params: Promise<{ stufe: string }> }) {
  const { stufe } = await params;
  const { form } = await requireMember(`/mitgliedschaft/bestellen/${stufe}`);
  const c = orderCopy(form);
  const [result, overview] = await Promise.all([getOrderSummary(stufe), getBillingOverview().catch(() => null)]);

  const back = (
    <p>
      <Link href="/mitgliedschaft">{c.back}</Link>
    </p>
  );

  if ("error" in result) {
    return (
      <div className="stack stack-lg">
        {back}
        <EmptyState
          title={result.error === "tier_not_orderable" ? c.tierNotOrderable : c.tierMissingTitle}
          action={<ButtonLink href="/mitgliedschaft">{c.back}</ButtonLink>}
        />
      </div>
    );
  }
  if (overview && hasRunningMembership(overview)) {
    return (
      <div className="stack stack-lg">
        {back}
        <EmptyState title={c.alreadyMemberTitle} action={<ButtonLink href="/mitgliedschaft">{c.back}</ButtonLink>}>
          <p>{c.errors.already_member}</p>
        </EmptyState>
      </div>
    );
  }

  const s = result.summary;
  const policyUrl = s.withdrawal_policy_url && s.withdrawal_policy_url.startsWith("/") ? s.withdrawal_policy_url : "/rechtliches/widerruf";
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || null;

  return (
    <div className="stack stack-lg">
      {back}
      <PageHeader eyebrow={s.tier_name} title={c.title} lead={c.lead} />
      <div className="order-layout">
        <Card title={c.summaryTitle} id="uebersicht">
          <p className="cluster">
            <Badge tone="brass">{c.draft}</Badge>
            <span className="muted text-sm">{c.draftText}</span>
          </p>
          <div className="price-line">
            <span className="price-line__value">{s.price_display}</span>
            <span className="soft">{c.perPeriodVat(s.vat_note)}</span>
          </div>
          <dl className="facts order-facts">
            <dt>{c.labels.tier}</dt>
            <dd>
              <strong>{s.tier_name}</strong>
            </dd>
            <dt>{c.labels.price}</dt>
            <dd>{c.price(s.price_display, s.vat_note)}</dd>
            <dt>{c.labels.period}</dt>
            <dd>{c.period(s.period_label)}</dd>
            <dt>{c.labels.evenings}</dt>
            <dd>{c.evenings(s.evenings_per_period)}</dd>
            {s.tier_note ? (
              <>
                <dt>{c.labels.note}</dt>
                <dd>{s.tier_note}</dd>
              </>
            ) : null}
            <dt>{c.labels.renewal}</dt>
            <dd>{s.renewal}</dd>
            <dt>{c.labels.cancellation}</dt>
            <dd>{s.cancellation_terms}</dd>
            <dt>{c.labels.withdrawal}</dt>
            <dd>
              {s.withdrawal_note} <Link href={policyUrl}>{c.withdrawalPolicy}</Link>
            </dd>
            {s.extension_rule ? (
              <>
                <dt>{c.labels.extension}</dt>
                <dd>{s.extension_rule}</dd>
              </>
            ) : null}
          </dl>
          <p className="text-sm">
            <Link href="/rechtliches/agb">{c.terms}</Link>
          </p>
        </Card>
        <div className="order-layout__aside">
          <Card id="abschluss">
            <OrderForm
              form={form}
              tier={s.tier}
              summaryHash={s.summary_hash}
              amount={s.price_cents}
              currency={s.currency || "eur"}
              startRequestText={s.start_request_text || c.startRequestFallback}
              publishableKey={publishableKey}
              resultPath="/mitgliedschaft/bestellen/ergebnis"
            />
          </Card>
        </div>
      </div>
    </div>
  );
}
