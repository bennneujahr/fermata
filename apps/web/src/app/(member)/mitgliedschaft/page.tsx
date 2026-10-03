import type { Metadata } from "next";
import { Badge, Card, PageHeader } from "@/components/ui";
import { status as statusCopy } from "@/copy/common";
import { placeholders } from "@/copy/member";
import { getPublicSettings, requireMember } from "@/lib/data";
import { formatEuro } from "@/lib/format";
import { titles } from "@/copy/titles";

export const metadata: Metadata = { title: titles.mitgliedschaft };

// Platzhalter für M6 (Stripe, Bestell-, Kündigungs- und Widerrufsknopf). Zeigt den aktuellen Stand.
export default async function MembershipPage() {
  const [{ overview, form }, settings] = await Promise.all([requireMember("/mitgliedschaft"), getPublicSettings()]);
  const c = placeholders(form).mitgliedschaft;
  const tiers = Object.entries(settings["billing.tiers"] ?? {});
  const state = overview.membership?.status ?? "free";
  return (
    <div className="stack stack-lg">
      <PageHeader title={c.title} lead={c.lead} />
      <Card title={c.current} id="aktuell">
        <dl className="facts">
          <dt>{c.current}</dt>
          <dd>
            <Badge tone="brass">{c.statusLabels[state] ?? state}</Badge>
          </dd>
          <dt>{c.available}</dt>
          <dd>{overview.available_evenings}</dd>
        </dl>
      </Card>
      <section className="stack" aria-labelledby="stufen">
        <div className="cluster">
          <h2 id="stufen">{c.tiersTitle}</h2>
          <Badge tone="brass">{statusCopy.comingSoon}</Badge>
        </div>
        <p className="soft measure">{c.tiersText}</p>
        <div className="grid-auto">
          {tiers.map(([key, t]) => (
            <Card key={key} title={t.name} headingLevel={3} variant="outline">
              <p className="stat">
                <span className="stat__value">{formatEuro(t.price_cents)}</span>
                <span className="stat__label">{c.perPeriod}</span>
              </p>
              <p className="soft">{c.evenings(t.evenings)}</p>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
