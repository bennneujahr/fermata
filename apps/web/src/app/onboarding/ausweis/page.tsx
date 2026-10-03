import type { Metadata } from "next";
import Link from "next/link";
import { Badge, ButtonLink, Card, Notice } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { status as statusCopy } from "@/copy/common";
import { consentStep, returnPage, verifyStep } from "@/copy/onboarding";
import { getConsents, getLegalDocument, getOnboardingSettings, requireMember } from "@/lib/data";
import { Markdown } from "@/lib/markdown";
import { OnboardingHeader } from "../OnboardingHeader";
import { BiometricConsent } from "./BiometricConsent";
import { StartVerification } from "./StartVerification";

export const metadata: Metadata = { title: "Ausweis" };

export default async function VerifyStepPage() {
  const [{ overview, form }, consents, doc, settings] = await Promise.all([
    requireMember("/onboarding/ausweis"),
    getConsents(),
    getLegalDocument("biometrie"),
    getOnboardingSettings(),
  ]);
  const c = verifyStep(form);
  const o = overview.onboarding;
  const v = o.verification;
  const consented = consents.find((k) => k.kind === "biometrie")?.granted ?? false;
  const attemptsLeft = o.verification_attempts_left ?? 0;
  const factsMissing = !o.facts_done;

  const verified = v?.verified === true;
  const pending = v?.status === "in_review";
  const blocked = v?.status === "blocked";
  const failed = v && ["declined", "expired", "error"].includes(v.status);
  const canStart = !verified && !pending && !blocked && attemptsLeft > 0 && !factsMissing;

  return (
    <div className="stack stack-lg">
      <OnboardingHeader onboarding={o} current="ausweis" form={form} />
      <header className="stack stack-sm">
        <h1>{c.title}</h1>
        <p className="lead">{c.lead}</p>
      </header>

      {verified ? (
        <Notice tone="success" title={c.states.approved}>
          <ButtonLink href="/start" variant="secondary" size="sm">
            {returnPage(form).toStart}
          </ButtonLink>
        </Notice>
      ) : null}
      {pending ? <Notice tone="info">{c.states.in_review}</Notice> : null}
      {blocked ? <Notice tone="warning">{c.states.blocked}</Notice> : null}
      {failed && v ? (
        <Notice tone="warning" title={c.states[v.status]}>
          <ul className="list-plain stack stack-sm">
            {v.is_adult === false ? <li>{c.notAdult}</li> : null}
            {v.name_match === false ? <li>{c.mismatchName}</li> : null}
            {v.birth_date_match === false ? <li>{c.mismatchBirth}</li> : null}
            <li className="muted">{attemptsLeft > 0 ? c.attemptsLeft(attemptsLeft) : c.noAttempts}</li>
          </ul>
          {v.name_match === false || v.birth_date_match === false ? (
            <p>
              <Link href="/onboarding/angaben">{c.fixFacts}</Link>
            </p>
          ) : null}
        </Notice>
      ) : null}

      {!verified && !blocked ? (
        <Card title={c.howTitle}>
          <ol className="stack stack-sm">
            {c.how.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ol>
        </Card>
      ) : null}

      {!verified && !blocked && !consented && doc ? (
        <Card title={c.consentTitle} eyebrow={doc.status === "entwurf" ? <Badge tone="brass">{statusCopy.draft}</Badge> : undefined}>
          <div className="doc-box" tabIndex={0} aria-label={doc.title}>
            <Markdown source={doc.body_markdown} />
          </div>
          <BiometricConsent version={doc.version} label={consentStep(form).checkbox.biometrie!} form={form} />
        </Card>
      ) : null}

      {canStart && consented ? (
        <Card variant="accent">
          <StartVerification form={form} />
          <p className="muted text-sm">{c.redirectNote}</p>
        </Card>
      ) : null}

      <Card variant="outline" title={c.alternativeTitle} headingLevel={2}>
        {settings.verification_alternative_enabled ? null : (
          <div className="cluster">
            <Icon name="info" size={18} />
            <Badge tone="brass">{statusCopy.comingSoon}</Badge>
          </div>
        )}
        <p className="soft">{c.alternativeText}</p>
      </Card>
    </div>
  );
}
