import type { Metadata } from "next";
import Link from "next/link";
import { HelpNumbers } from "@/components/sicherheit/HelpNumbers";
import { ButtonLink, Card, PageHeader } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { help, titles } from "@/copy/sicherheit";
import { getPublicSettings, getSession } from "@/lib/data";
import { getHelpContacts } from "@/lib/safety";
import { currentForm } from "../form";

export const metadata: Metadata = { title: titles.hilfe };

// Hilfe-Knopf (immer oben rechts): Notruf, Heimwegtelefon, weitere Hilfe-Nummern aus api.help_contacts(),
// dazu Melden und Abend teilen. Auch ohne Anmeldung erreichbar.
export default async function HelpPage() {
  const [contacts, settings, form, { claims }] = await Promise.all([getHelpContacts(), getPublicSettings(), currentForm(), getSession()]);
  const c = help(form);
  const contact = settings["site.contact_email"];
  const member = Boolean(claims?.sub);
  return (
    <div className="stack stack-lg">
      <PageHeader title={c.title} lead={c.lead} />
      <Card title={c.emergencyTitle} variant="outline" id="notruf">
        <p className="soft">{c.emergencyText}</p>
        <HelpNumbers contacts={contacts} form={form} variant="full" />
      </Card>
      <div className="grid-auto">
        <Card title={c.reportTitle} id="melden">
          <p className="soft">{c.reportText}</p>
          {member ? (
            <div>
              <ButtonLink href="/sicherheit/melden" icon="flag">
                {c.reportCta}
              </ButtonLink>
            </div>
          ) : (
            <>
              <p className="muted text-sm">{c.reportLoggedOut}</p>
              {contact ? (
                <p>
                  <a href={`mailto:${contact}`}>{contact}</a>
                </p>
              ) : null}
            </>
          )}
        </Card>
        <Card title={c.shareTitle} id="teilen">
          <p className="soft">{c.shareText}</p>
          {member ? (
            <div>
              <ButtonLink href="/sicherheit/teilen" variant="secondary" icon="share">
                {c.shareCta}
              </ButtonLink>
            </div>
          ) : null}
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
        {member ? (
          <p>
            <Link href="/sicherheit">{c.safetyCta}</Link>
          </p>
        ) : null}
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
