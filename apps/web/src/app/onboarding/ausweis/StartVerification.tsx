"use client";
import { useActionState, useEffect } from "react";
import { startVerificationAction } from "@/app/actions/onboarding";
import { Notice, SubmitButton } from "@/components/ui";
import { errors } from "@/copy/common";
import type { AddressForm } from "@/copy/form";
import { verifyStep } from "@/copy/onboarding";

/** Startet die Prüfung (Edge Function verification-start) und leitet zu Didit bzw. zur Simulation weiter. */
export function StartVerification({ form }: { form: AddressForm }) {
  const [state, action] = useActionState(startVerificationAction, {});
  const c = verifyStep(form);
  useEffect(() => {
    if (state.ok && state.url) window.location.assign(state.url);
  }, [state]);
  return (
    <form action={action} className="stack">
      <div>
        <SubmitButton icon="id" pendingLabel={c.starting}>
          {c.start}
        </SubmitButton>
      </div>
      {state.ok && state.url ? <p role="status" className="muted">{c.starting}</p> : null}
      {state.error ? (
        <Notice tone="danger" live="assertive">
          {c.errors[state.error] ?? errors.generic(form)}
        </Notice>
      ) : null}
    </form>
  );
}
