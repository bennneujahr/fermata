import type { ReactNode } from "react";
import { Icon } from "./Icon";

export type StepState = "done" | "current" | "todo";

export interface Step {
  key: string;
  label: ReactNode;
  state: StepState;
  href?: string;
}

/**
 * Fortschritt in Schritten. Horizontal als schmale Balken (Onboarding-Kopf),
 * vertikal als Liste mit Nummern (Startseite). aria-current="step" markiert den aktuellen Schritt.
 */
export function Stepper({
  steps,
  label,
  stateLabels,
  vertical,
}: {
  steps: Step[];
  label: string;
  stateLabels: Record<StepState, string>;
  vertical?: boolean;
}) {
  return (
    <nav aria-label={label}>
      <ol className={["stepper", vertical && "stepper--vertical"].filter(Boolean).join(" ")} data-steps={steps.length}>
        {steps.map((s, i) => (
          <li key={s.key} className="stepper__item" data-state={s.state} aria-current={s.state === "current" ? "step" : undefined}>
            <span className="stepper__bar" aria-hidden="true" />
            {vertical ? (
              <span className="stepper__dot" aria-hidden="true">
                {s.state === "done" ? <Icon name="check" size={16} /> : i + 1}
              </span>
            ) : null}
            <span className="stepper__label">
              {!vertical && s.state === "done" ? <Icon name="check" size={14} className="stepper__check" /> : null}
              {s.label}
              <span className="visually-hidden">, {stateLabels[s.state]}</span>
            </span>
            {vertical ? (
              <span className="stepper__state" aria-hidden="true">
                {stateLabels[s.state]}
              </span>
            ) : null}
          </li>
        ))}
      </ol>
    </nav>
  );
}
