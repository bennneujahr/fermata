import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";
import { footerLinks, legal } from "@/copy/rechtliches";

export const metadata: Metadata = { title: legal.title };

export default function LegalIndex() {
  const main = legal.order.filter((k) => legal.mainKinds.includes(k));
  const consents = legal.order.filter((k) => !legal.mainKinds.includes(k));
  return (
    <div className="stack stack-lg">
      <PageHeader title={legal.title} lead={legal.lead} />
      <Card>
        <ul className="list-plain list-divided">
          {main.map((k) => (
            <li key={k}>
              <Link href={`/rechtliches/${k}`}>{legal.kinds[k]}</Link>
            </li>
          ))}
        </ul>
      </Card>
      <Card title={legal.contractTitle} variant="sunk" id="vertraege">
        <p className="soft">{legal.contractText}</p>
        <ul className="list-plain list-divided">
          <li>
            <Link href="/kuendigen">{footerLinks.cancel}</Link>
          </li>
          <li>
            <Link href="/widerrufen">{footerLinks.withdraw}</Link>
          </li>
        </ul>
      </Card>
      <Card title={legal.consentsTitle} variant="outline" id="einwilligungen">
        <ul className="list-plain list-divided">
          {consents.map((k) => (
            <li key={k}>
              <Link href={`/rechtliches/${k}`}>{legal.kinds[k]}</Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
