import type { Metadata } from "next";
import { ButtonLink, Card, Notice } from "@/components/ui";
import { Fermate } from "@/components/ui/Icon";
import { returnPage, verifyStep } from "@/copy/onboarding";
import { requireMember } from "@/lib/data";
import { Poll } from "./Poll";

export const metadata: Metadata = { title: "Ausweisprüfung" };

// Rückkehr von Didit (callback). Das Ergebnis kommt per Webhook; diese Seite fragt kurz nach.
export default async function VerifyReturnPage() {
  const { overview, form } = await requireMember("/onboarding/ausweis/zurueck");
  const c = returnPage(form);
  const v = overview.onboarding.verification;
  const final = v && v.status !== "started";
  if (v?.verified) {
    return (
      <div className="focus-card stack">
        <Fermate className="hero-mark" />
        <h1>{c.approvedTitle}</h1>
        <p className="lead">{c.approvedText}</p>
        <div>
          <ButtonLink href="/start" iconAfter="arrowRight">
            {c.toStart}
          </ButtonLink>
        </div>
      </div>
    );
  }
  return (
    <div className="focus-card stack">
      <Fermate className="hero-mark" />
      <h1>{c.title}</h1>
      {final && v ? (
        <Notice tone={v.status === "in_review" ? "info" : "warning"}>{verifyStep(form).states[v.status]}</Notice>
      ) : (
        <Card>
          <Poll waiting={c.waiting} stillWaiting={c.stillWaiting} />
        </Card>
      )}
      <div className="cluster">
        <ButtonLink href="/onboarding/ausweis" variant="secondary">
          {c.toStep}
        </ButtonLink>
      </div>
    </div>
  );
}
