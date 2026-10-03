import { Stepper } from "@/components/ui";
import type { AddressForm } from "@/copy/form";
import { stepLabel, stepper } from "@/copy/onboarding";
import type { Onboarding } from "@/lib/types";
import { ONBOARDING_STEPS } from "@/lib/routes";

/** Kopf jedes Onboarding-Schritts: Fortschritt (aus der Datenbank) und „Schritt n von 4“. */
export function OnboardingHeader({ onboarding, current, form }: { onboarding: Onboarding; current: string; form: AddressForm }) {
  const db = new Map((onboarding.steps ?? []).map((s) => [s.key, s.state]));
  const steps = ONBOARDING_STEPS.map((key) => ({
    key,
    label: stepLabel(key, form),
    state: key === current ? ("current" as const) : db.get(key) === "done" ? ("done" as const) : ("todo" as const),
  }));
  const index = ONBOARDING_STEPS.indexOf(current as (typeof ONBOARDING_STEPS)[number]);
  return (
    <div className="onboarding-head">
      <div className="onboarding-head__meta">
        <span>{stepper.stepOf(index + 1, ONBOARDING_STEPS.length)}</span>
        <span className="onboarding-head__current" aria-hidden="true">
          {stepLabel(current, form)}
        </span>
      </div>
      <Stepper steps={steps} label={stepper.label} stateLabels={{ done: stepper.done, current: stepper.current, todo: stepper.todo }} />
    </div>
  );
}
