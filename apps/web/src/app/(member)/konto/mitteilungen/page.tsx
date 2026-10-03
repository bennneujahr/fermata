import { createHash } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import "@/styles/gespraech-abende.css";
import { RevokeButton } from "@/app/(member)/konto/einwilligungen/RevokeButton";
import { ConsentRenewal } from "@/components/gespraech/ConsentRenewal";
import { InlineConsent } from "@/components/gespraech/InlineConsent";
import { renewal } from "@/copy/gespraech";
import { ButtonLink, Card, PageHeader } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { push as pushCopy } from "@/copy/push";
import { titles } from "@/copy/titles";
import { getConsents, getSession, requireMember } from "@/lib/data";
import { PushSettings, type DeviceRow } from "./PushSettings";

export const metadata: Metadata = { title: titles.mitteilungen };

export default async function NotificationsPage() {
  const [{ form }, consents, { supabase }] = await Promise.all([requireMember("/konto/mitteilungen"), getConsents(), getSession()]);
  const c = pushCopy(form);
  const consent = consents.find((k) => k.kind === "push");
  const granted = Boolean(consent?.granted);
  const renew = Boolean(consent?.granted && consent.needs_renewal);
  const { data } = await supabase.schema("app").from("push_subscriptions").select("id, endpoint, platform, created_at, last_success_at").order("created_at");
  const devices: DeviceRow[] = ((data ?? []) as { id: string; endpoint: string; platform: string | null; created_at: string; last_success_at: string | null }[]).map((r) => ({
    id: r.id,
    platform: r.platform,
    created_at: r.created_at,
    last_success_at: r.last_success_at,
    endpoint_hash: createHash("sha256").update(r.endpoint).digest("hex"),
  }));
  return (
    <div className="stack stack-lg">
      <p>
        <Link href="/konto" className="cluster back-link">
          <Icon name="arrowLeft" size={18} />
          {c.back}
        </Link>
      </p>
      <PageHeader title={c.title} lead={c.lead} />
      <Card variant="sunk" id="regeln">
        <ul className="list-check list-plain stack stack-sm">
          {c.facts.map((f) => (
            <li key={f}>
              <Icon name="check" size={18} />
              <span>{f}</span>
            </li>
          ))}
        </ul>
      </Card>
      {renew ? <ConsentRenewal kind="push" form={form} returnTo="/konto/mitteilungen" name={renewal(form).names.push!} /> : null}
      {granted ? (
        <Card title={c.cardTitle} id="geraet">
          <PushSettings form={form} devices={devices} sampleBody={c.sample} />
          <div className="card__footer">
            <RevokeButton kind="push" label={c.allOff} title={c.allOffTitle} text={c.allOffText} confirmLabel={c.allOffConfirm} doneLabel={c.allOffDone} />
          </div>
        </Card>
      ) : (
        <InlineConsent kind="push" form={form} label={c.consentAgree} returnTo="/konto/mitteilungen" title={c.consentTitle} lead={c.consentLead} readLabel={c.consentRead} />
      )}
      <Card title={c.iosTitle} id="iphone" variant="outline">
        <p className="soft">{c.iosText}</p>
        <div>
          <ButtonLink href="/installieren" variant="secondary" icon="device">
            {c.iosCta}
          </ButtonLink>
        </div>
      </Card>
    </div>
  );
}
