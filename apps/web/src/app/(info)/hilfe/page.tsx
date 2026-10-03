import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, PageHeader } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { help } from "@/copy/help";
import { getPublicSettings } from "@/lib/data";
import { telHref } from "@/lib/format";
import { currentForm } from "../form";
import { titles } from "@/copy/titles";

export const metadata: Metadata = { title: titles.hilfe };

export default async function HelpPage() {
  const [settings, form] = await Promise.all([getPublicSettings(), currentForm()]);
  const c = help(form);
  const emergency = settings["safety.emergency_number"] ?? "110";
  const heimweg = settings["safety.heimwegtelefon_number"];
  const hours = settings["safety.heimwegtelefon_hours"];
  const contact = settings["site.contact_email"];
  return (
    <div className="stack stack-lg">
      <PageHeader title={c.title} lead={c.lead} />
      <div className="grid-auto">
        <Card title={c.emergencyTitle} variant="outline" id="notruf">
          <p className="soft">{c.emergencyText}</p>
          <a href={telHref(emergency)} className="call call--emergency">
            <span className="call__icon">
              <Icon name="phone" />
            </span>
            <span className="call__text">{c.emergencyCta(emergency)}</span>
          </a>
        </Card>
        {heimweg ? (
          <Card title={c.heimwegTitle} variant="outline" id="heimweg">
            <p className="soft">{c.heimwegText}</p>
            <a href={telHref(heimweg)} className="call">
              <span className="call__icon">
                <Icon name="phone" />
              </span>
              <span className="call__text">
                <span>{c.heimwegCta(heimweg)}</span>
                {hours ? <span className="call__sub">{c.heimwegHours(hours)}</span> : null}
              </span>
            </a>
          </Card>
        ) : null}
      </div>
      <div className="grid-auto">
        <Card title={c.reportTitle} id="melden" eyebrow={<Badge tone="brass">{c.comingSoon}</Badge>}>
          <p className="soft">{c.reportText}</p>
          <p className="muted text-sm">{c.reportSoon}</p>
          {contact ? (
            <p>
              <a href={`mailto:${contact}`}>{contact}</a>
            </p>
          ) : null}
        </Card>
        <Card title={c.shareTitle} id="teilen" eyebrow={<Badge tone="brass">{c.comingSoon}</Badge>}>
          <p className="soft">{c.shareText}</p>
        </Card>
      </div>
      <Card title={c.standardsTitle} variant="sunk" id="standards">
        <ul className="list-check list-plain stack stack-sm">
          {c.standards.map((s) => (
            <li key={s}>
              <Icon name="check" size={18} />
              <span>{s}</span>
            </li>
          ))}
        </ul>
      </Card>
      <Card title={c.contactTitle} variant="outline" id="kontakt">
        <p className="soft">{c.contactText}</p>
        {contact ? (
          <p>
            <a href={`mailto:${contact}`}>{contact}</a>
          </p>
        ) : null}
        <p>
          <Link href="/installieren">{c.installLink}</Link>
        </p>
      </Card>
    </div>
  );
}
