import type { Metadata } from "next";
import Link from "next/link";
import { ThemeSwitcher } from "@/components/pwa/ThemeSwitcher";
import { LogoutButton } from "@/components/shell/LogoutButton";
import { ButtonLink, Card, Notice, PageHeader } from "@/components/ui";
import { actions } from "@/copy/common";
import { konto } from "@/copy/member";
import { getFacts, getSession, requireMember } from "@/lib/data";
import { formatDate } from "@/lib/format";
import { AddressFormSwitch } from "./AddressFormSwitch";
import { titles } from "@/copy/titles";
import { nav } from "@/copy/common";

export const metadata: Metadata = { title: titles.konto };

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ gespeichert?: string }> }) {
  const [{ overview, form }, facts, { claims }, sp] = await Promise.all([requireMember("/konto"), getFacts(), getSession(), searchParams]);
  const c = konto(form);
  return (
    <div className="stack stack-lg">
      <PageHeader title={c.title} lead={c.lead} />
      {sp.gespeichert ? (
        <Notice tone="success" live="polite">
          {c.addressFormSaved}
        </Notice>
      ) : null}

      <div className="grid-auto">
        <Card
          title={c.factsTitle}
          id="angaben"
          footer={
            <ButtonLink href="/onboarding/angaben?zurueck=konto" variant="secondary" size="sm" icon="settings">
              {actions.edit}
            </ButtonLink>
          }
        >
          {facts ? (
            <dl className="facts">
              <dt>{c.labels.name}</dt>
              <dd>
                {facts.first_name} {facts.last_name}
              </dd>
              <dt>{c.labels.birthDate}</dt>
              <dd>{formatDate(facts.birth_date)}</dd>
              <dt>{c.labels.place}</dt>
              <dd>
                {facts.postal_code} {facts.city}
              </dd>
              {facts.street ? (
                <>
                  <dt>{c.labels.street}</dt>
                  <dd>{facts.street}</dd>
                </>
              ) : null}
              <dt>{c.labels.phone}</dt>
              <dd>{facts.phone ?? "–"}</dd>
              <dt>{c.labels.email}</dt>
              <dd>{claims?.email ?? "–"}</dd>
            </dl>
          ) : (
            <p className="muted">{c.factsEmpty}</p>
          )}
        </Card>

        <Card title={c.addressFormTitle} id="anrede">
          <AddressFormSwitch current={overview.onboarding.address_form ?? "sie"} />
          <ThemeSwitcher />
        </Card>
      </div>

      <div className="grid-auto">
        <Card
          title={c.consentsTitle}
          id="einwilligungen"
          footer={
            <ButtonLink href="/konto/einwilligungen" variant="secondary" size="sm" iconAfter="arrowRight">
              {c.consentsCta}
            </ButtonLink>
          }
        >
          <p className="soft">{c.consentsLead}</p>
        </Card>
        <Card
          title={c.identityTitle}
          id="ueber-sie"
          footer={
            <ButtonLink href="/onboarding/identitaet?zurueck=konto" variant="secondary" size="sm" icon="settings">
              {actions.edit}
            </ButtonLink>
          }
        >
          <p className="soft">{c.identityText}</p>
        </Card>
        <Card title={c.notificationsTitle} id="mitteilungen">
          <p className="soft">{c.notificationsText}</p>
        </Card>
      </div>

      <Card title={c.dataTitle} id="daten" variant="sunk">
        <ul className="list-plain list-divided">
          <li className="stack stack-sm">
            <p className="soft">{c.exportText}</p>
            <div>
              <ButtonLink href="/konto/daten" variant="secondary" icon="download">
                {c.exportCta}
              </ButtonLink>
            </div>
          </li>
          <li className="stack stack-sm">
            <p className="soft">{c.deleteText}</p>
            <div>
              <ButtonLink href="/konto/loeschen" variant="quiet" icon="trash">
                {c.deleteCta}
              </ButtonLink>
            </div>
          </li>
        </ul>
      </Card>

      <section className="cluster" aria-label={c.sessionTitle}>
        <LogoutButton className="btn btn--secondary" label={c.logout} />
        <Link href="/rechtliches" className="text-sm">
          {nav.legal}
        </Link>
      </section>
    </div>
  );
}
