import type { Metadata } from "next";
import { Card } from "@/components/ui";
import { factsStep } from "@/copy/onboarding";
import { getFacts, getOnboardingSettings, requireMember } from "@/lib/data";
import { OnboardingHeader } from "../OnboardingHeader";
import { FactsForm } from "./FactsForm";

export const metadata: Metadata = { title: "Angaben" };

export default async function FactsStepPage({ searchParams }: { searchParams: Promise<{ zurueck?: string }> }) {
  const [{ overview, form }, facts, settings, sp] = await Promise.all([
    requireMember("/onboarding/angaben"),
    getFacts(),
    getOnboardingSettings(),
    searchParams,
  ]);
  const c = factsStep(form);
  const locked = overview.onboarding.verification?.verified === true;
  return (
    <div className="stack stack-lg">
      <OnboardingHeader onboarding={overview.onboarding} current="angaben" form={form} />
      <header className="stack stack-sm">
        <h1>{c.title}</h1>
        <p className="lead">{c.lead}</p>
      </header>
      <Card>
        <FactsForm
          form={form}
          facts={facts}
          collectStreet={settings.collect_street}
          locked={locked}
          returnTo={sp.zurueck === "konto" ? "/konto" : undefined}
        />
      </Card>
      <p className="muted text-sm">{c.privacyNote}</p>
    </div>
  );
}
