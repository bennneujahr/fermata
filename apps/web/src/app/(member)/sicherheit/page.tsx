// Sicherheit: Überblick über Melden, Abend teilen, Hilfe-Nummern, eigene Meldungen, Hinweise und Widerspruch.
import type { Metadata } from "next";
import { HelpNumbers } from "@/components/sicherheit/HelpNumbers";
import { ButtonLink, Card, PageHeader } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { safety, titles } from "@/copy/sicherheit";
import { requireMember } from "@/lib/data";
import { getHelpContacts, getMyReports, getMySanctions, getMyTrustShares } from "@/lib/safety";

export const metadata: Metadata = { title: titles.sicherheit };

export default async function SafetyPage() {
  const { form } = await requireMember("/sicherheit");
  const c = safety(form);
  const [contacts, reports, sanctions, shares] = await Promise.all([getHelpContacts(), getMyReports(), getMySanctions(), getMyTrustShares()]);
  const activeShares = (shares ?? []).filter((s) => s.active).length;
  const openSanctions = (sanctions ?? []).filter((s) => !s.lifted_at).length;
  return (
    <div className="stack stack-lg">
      <PageHeader title={c.title} lead={c.lead} />
      <div className="grid-auto grid-start">
        <Card title={c.reportTitle} id="melden" variant="accent">
          <p className="soft">{c.reportText}</p>
          <div>
            <ButtonLink href="/sicherheit/melden" icon="flag">
              {c.reportCta}
            </ButtonLink>
          </div>
        </Card>
        <Card title={c.shareTitle} id="teilen">
          <p className="soft">{c.shareText}</p>
          {activeShares ? <p className="text-sm muted">{c.shareCount(activeShares)}</p> : null}
          <div>
            <ButtonLink href="/sicherheit/teilen" variant="secondary" icon="share">
              {c.shareCta}
            </ButtonLink>
          </div>
        </Card>
      </div>
      <Card title={c.helpTitle} id="hilfe" variant="outline">
        <HelpNumbers contacts={contacts} form={form} variant="compact" />
        <div>
          <ButtonLink href="/hilfe" variant="quiet" iconAfter="arrowRight">
            {c.helpCta}
          </ButtonLink>
        </div>
      </Card>
      <div className="grid-auto grid-start">
        <Card title={c.reportsTitle} id="meldungen" variant="sunk" headingLevel={2}>
          <p className="soft">{c.reportsCount(reports?.length ?? 0)}</p>
          <div>
            <ButtonLink href="/sicherheit/meldungen" variant="secondary" size="sm">
              {c.reportsCta}
            </ButtonLink>
          </div>
        </Card>
        <Card title={c.sanctionsTitle} id="sanktionen" variant="sunk" headingLevel={2}>
          <p className="soft">{openSanctions ? c.sanctionsSome(openSanctions) : c.sanctionsNone}</p>
          {sanctions?.length ? (
            <div>
              <ButtonLink href="/sicherheit/sanktionen" variant="secondary" size="sm">
                {c.sanctionsCta}
              </ButtonLink>
            </div>
          ) : null}
        </Card>
      </div>
      <Card title={c.standardsTitle} id="standards" variant="outline">
        <ul className="list-check list-plain stack stack-sm">
          {c.standards.map((s) => (
            <li key={s}>
              <Icon name="check" size={18} />
              <span>{s}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
