import type { Metadata } from "next";
import { Card } from "@/components/ui";
import { identityStep } from "@/copy/onboarding";
import { getConsents, getIdentity, getLegalDocument, requireMember } from "@/lib/data";
import { OnboardingHeader } from "../OnboardingHeader";
import { IdentityForm } from "./IdentityForm";

export const metadata: Metadata = { title: "Über Sie" };

export default async function IdentityStepPage({ searchParams }: { searchParams: Promise<{ zurueck?: string }> }) {
  const [{ overview, form }, identity, consents, religionDoc, sp] = await Promise.all([
    requireMember("/onboarding/identitaet"),
    getIdentity(),
    getConsents(),
    getLegalDocument("art9_religion"),
    searchParams,
  ]);
  const c = identityStep(form);
  const religionGranted = consents.find((k) => k.kind === "art9_religion")?.granted ?? false;
  return (
    <div className="stack stack-lg">
      <OnboardingHeader onboarding={overview.onboarding} current="identitaet" form={form} />
      <header className="stack stack-sm">
        <h1>{c.title}</h1>
        <p className="lead">{c.lead}</p>
      </header>
      <Card>
        <IdentityForm
          form={form}
          identity={identity}
          religionDoc={religionDoc}
          religionGranted={religionGranted}
          returnTo={sp.zurueck === "konto" ? "/konto" : undefined}
        />
      </Card>
    </div>
  );
}
