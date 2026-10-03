import type { Metadata } from "next";
import Link from "next/link";
import { ContractHistory } from "@/components/mitgliedschaft/ContractHistory";
import { TierCards } from "@/components/mitgliedschaft/TierCards";
import { Badge, ButtonLink, Card, Notice, PageHeader } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { LABELS, membership, statusLabels, titles } from "@/copy/mitgliedschaft";
import { footerLinks } from "@/copy/rechtliches";
import { getBillingOverview, getContractHistory, getTiers, hasRunningMembership, nextBillingDate } from "@/lib/billing";
import type { BillingOverview } from "@/lib/billing-types";
import { requireMember } from "@/lib/data";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: titles.overview };

const tone = (s: string) => (s === "active" ? "success" : s === "past_due" ? "danger" : s === "cancelled" || s === "pending" ? "warning" : "brass");

export default async function MembershipPage() {
  const { form } = await requireMember("/mitgliedschaft");
  const c = membership(form);
  const overview: BillingOverview | null = await getBillingOverview().catch(() => null);
  if (!overview) {
    return (
      <div className="stack stack-lg">
        <PageHeader title={c.title} lead={c.lead} />
        <Notice tone="warning">{c.loadError}</Notice>
        <ContractLinks form={form} />
      </div>
    );
  }
  const o = overview;
  const [tiers, history] = await Promise.all([o.tiers?.length ? Promise.resolve(o.tiers) : getTiers(), getContractHistory(o)]);
  const running = hasRunningMembership(o);
  const next = nextBillingDate(o);
  const period = o.current_period;

  return (
    <div className="stack stack-lg">
      <PageHeader title={c.title} lead={c.lead} />

      <div className="grid-auto grid-start">
        <Card title={c.stateTitle} id="stand">
          <dl className="facts">
            <dt>{c.labels.status}</dt>
            <dd>
              <Badge tone={tone(o.status)}>{statusLabels[o.status] ?? o.status}</Badge>
            </dd>
            {o.tier_name ? (
              <>
                <dt>{c.labels.tier}</dt>
                <dd>{o.tier_name}</dd>
              </>
            ) : null}
            {o.contract_number ? (
              <>
                <dt>{c.labels.contract}</dt>
                <dd className="nowrap">{o.contract_number}</dd>
              </>
            ) : null}
            {o.ordered_at ? (
              <>
                <dt>{c.labels.orderedAt}</dt>
                <dd>{formatDate(o.ordered_at)}</dd>
              </>
            ) : null}
            {period ? (
              <>
                <dt>{c.labels.period}</dt>
                <dd>{c.periodRange(formatDate(period.starts_at), formatDate(period.extended_until ?? period.ends_at))}</dd>
              </>
            ) : null}
            {period?.extended_by_rule ? (
              <>
                <dt>{c.labels.extended}</dt>
                <dd>
                  {formatDate(period.extended_until ?? period.ends_at)} <span className="muted text-sm">({c.extendedByRule})</span>
                </dd>
              </>
            ) : null}
            <dt>{c.labels.available}</dt>
            <dd>{o.available_evenings}</dd>
            {o.reserved_evenings > 0 ? (
              <>
                <dt>{c.labels.reserved}</dt>
                <dd>{o.reserved_evenings}</dd>
              </>
            ) : null}
            {next ? (
              <>
                <dt>{c.labels.nextBilling}</dt>
                <dd>{formatDate(next)}</dd>
              </>
            ) : null}
            {o.cancel_at && (o.status === "cancelled" || o.status === "ended" || o.status === "withdrawn") ? (
              <>
                <dt>{c.labels.endsAt}</dt>
                <dd>{formatDate(o.cancel_at)}</dd>
              </>
            ) : null}
            {o.withdrawal.possible && o.withdrawal.until ? (
              <>
                <dt>{c.labels.withdrawUntil}</dt>
                <dd>{formatDate(o.withdrawal.until)}</dd>
              </>
            ) : null}
          </dl>
          {o.status === "pending" ? <Notice tone="info">{c.pendingText}</Notice> : null}
          {o.status === "past_due" ? <Notice tone="warning">{c.pastDueText}</Notice> : null}
          {o.status === "cancelled" && o.cancel_at ? <Notice tone="info">{c.cancelledText(formatDate(o.cancel_at))}</Notice> : null}
        </Card>

        <Card title={c.freeTitle} id="gratis" variant="sunk">
          {o.free_phase.active ? (
            <p className="soft">{running || o.status === "pending" ? c.freeActiveMember : c.freeActive}</p>
          ) : (
            <>
              {o.free_phase.ended_at ? <p className="soft">{c.freeEnded(formatDate(o.free_phase.ended_at))}</p> : null}
              {!running && o.status !== "pending" ? <p>{c.needMembership}</p> : null}
            </>
          )}
        </Card>
      </div>

      <section className="stack stack-md" aria-labelledby="stufen">
        <h2 id="stufen">{c.tiersTitle}</h2>
        <p className="soft measure">{c.tiersText}</p>
        <TierCards tiers={tiers} form={form} currentTier={running || o.status === "pending" ? o.tier : null} canOrder={!running} />
        {running ? <p className="muted text-sm">{c.runningHint}</p> : null}
        {o.status === "pending" ? <p className="muted text-sm">{c.pendingHint}</p> : null}
      </section>

      <section className="stack stack-md" aria-labelledby="vertrag">
        <h2 id="vertrag">{c.contractTitle}</h2>
        <div className="grid-auto">
          <Card variant="outline" title={LABELS.cancelEntry} headingLevel={3} id="kuendigen">
            <p className="soft">{o.cancellation.possible ? c.cancelText : c.noContract}</p>
            <div>
              <ButtonLink href="/mitgliedschaft/kuendigen" variant="secondary" iconAfter="arrowRight">
                {LABELS.cancelEntry}
              </ButtonLink>
            </div>
          </Card>
          {o.withdrawal.possible && o.withdrawal.until ? (
            <Card variant="outline" title={LABELS.withdrawEntry} headingLevel={3} id="widerrufen">
              <p className="soft">{c.withdrawText(formatDate(o.withdrawal.until))}</p>
              <div>
                <ButtonLink href="/mitgliedschaft/widerrufen" variant="secondary" iconAfter="arrowRight">
                  {LABELS.withdrawEntry}
                </ButtonLink>
              </div>
            </Card>
          ) : null}
        </div>
        <p className="text-sm">
          <Link href="/rechtliches/widerruf">{footerLinks.withdrawalPolicy}</Link>
          {" · "}
          <Link href="/rechtliches/agb">{c.termsLink}</Link>
        </p>
      </section>

      <Card title={c.historyTitle} id="verlauf" variant="sunk">
        <p className="soft text-sm">{c.historyText}</p>
        <ContractHistory items={history} form={form} />
      </Card>
    </div>
  );
}

function ContractLinks({ form }: { form: Parameters<typeof membership>[0] }) {
  const c = membership(form);
  return (
    <p className="cluster">
      <Icon name="arrowRight" size={18} />
      <Link href="/mitgliedschaft/kuendigen">{LABELS.cancelEntry}</Link>
      <span className="muted text-sm">{c.cancelText}</span>
    </p>
  );
}
