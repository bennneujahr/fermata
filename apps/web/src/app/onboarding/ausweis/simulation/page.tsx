import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { simulateVerificationAction } from "@/app/actions/simulation";
import { Button, Card, Notice } from "@/components/ui";
import { simulation } from "@/copy/onboarding";
import { requireMember } from "@/lib/data";
import { diditFakeEnabled } from "@/lib/env";

export const metadata: Metadata = { title: simulation.title };

// Nur mit DIDIT_MODE=fake außerhalb von production: ersetzt Didit beim lokalen Durchklicken und in E2E-Tests.
export default async function SimulationPage({ searchParams }: { searchParams: Promise<{ sitzung?: string }> }) {
  if (!diditFakeEnabled()) notFound();
  await requireMember("/onboarding/ausweis");
  const { sitzung } = await searchParams;
  if (!sitzung || !/^fake_[0-9a-f-]{36}$/.test(sitzung)) notFound();
  return (
    <div className="stack stack-lg">
      <header className="stack stack-sm">
        <h1>{simulation.title}</h1>
        <p className="lead">{simulation.lead}</p>
      </header>
      <Notice tone="draft">{simulation.session(sitzung)}</Notice>
      <Card>
        <form action={simulateVerificationAction} className="stack">
          <input type="hidden" name="session" value={sitzung} />
          {Object.entries(simulation.scenarios).map(([key, label], i) => (
            <Button key={key} type="submit" name="scenario" value={key} variant={i === 0 ? "primary" : "secondary"} block>
              {label}
            </Button>
          ))}
        </form>
      </Card>
    </div>
  );
}
