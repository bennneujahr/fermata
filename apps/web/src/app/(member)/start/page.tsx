import type { Metadata } from "next";
import Link from "next/link";
import { Badge, ButtonLink, Card, PageHeader, Stepper } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { start } from "@/copy/member";
import { stepLabel, stepper } from "@/copy/onboarding";
import { requireMember } from "@/lib/data";
import { onboardingPath } from "@/lib/routes";

export const metadata: Metadata = { title: "Start" };

export default async function StartPage() {
  const { overview, form } = await requireMember();
  const c = start(form);
  const o = overview.onboarding;
  const next = o.next_step ?? "einwilligungen";
  const nextCopy = c.next[next]!;
  const steps = (o.steps ?? []).map((s) => ({ key: s.key, state: s.state, label: stepLabel(s.key, form) }));
  const done = o.complete;
  return (
    <div className="stack stack-lg">
      <PageHeader
        eyebrow={o.is_founding_member ? c.founding : undefined}
        title={c.greeting(overview.first_name)}
        lead={done ? c.leadActive : c.leadOnboarding}
      />

      <div className="grid-auto">
        <Card title={nextCopy.title} eyebrow={c.nextTitle} variant={done ? "night" : "accent"} id="naechster-schritt">
          <p className={done ? "soft" : "soft"}>{nextCopy.text}</p>
          <div>
            <ButtonLink href={done ? "/gespraech" : onboardingPath(next)} iconAfter="arrowRight" variant={done ? "secondary" : "primary"}>
              {nextCopy.cta}
            </ButtonLink>
          </div>
        </Card>

        <Card title={c.progressTitle} id="stand">
          <Stepper
            vertical
            label={c.progressTitle}
            steps={steps}
            stateLabels={{ done: stepper.done, current: stepper.current, todo: stepper.todo }}
          />
        </Card>
      </div>

      <div className="grid-auto">
        <Card title={c.membershipTitle} id="mitgliedschaft" variant="sunk">
          <div className="cluster">
            <Badge tone="brass">{c.freePhase}</Badge>
            <span className="soft">{c.eveningsAvailable(overview.available_evenings)}</span>
          </div>
          <p className="muted">{c.freePhaseText}</p>
        </Card>
        <Card title={c.installTitle} id="installieren" variant="outline">
          <p className="soft">{c.installText}</p>
          <p>
            <Link href="/installieren" className="cluster">
              <Icon name="device" size={18} />
              {c.installCta}
            </Link>
          </p>
        </Card>
      </div>

      {overview.is_admin_user ? (
        <p className="muted text-sm">
          {c.adminHint} <Link href="/admin">{c.toAdmin}</Link>
        </p>
      ) : null}
    </div>
  );
}
