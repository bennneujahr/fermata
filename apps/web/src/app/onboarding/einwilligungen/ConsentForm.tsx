"use client";
import { useActionState } from "react";
import { giveConsentAction } from "@/app/actions/onboarding";
import { initialState } from "@/app/actions/state";
import { Checkbox, Notice, SubmitButton } from "@/components/ui";
import { actions, errors } from "@/copy/common";
import type { AddressForm } from "@/copy/form";
import { consentStep } from "@/copy/onboarding";

/** Ein Häkchen, ein Knopf: Einwilligung für genau diese Fassung des Textes. */
export function ConsentForm({ kind, version, label, form, returnTo }: { kind: string; version: string; label: string; form: AddressForm; returnTo?: string }) {
  const [state, action] = useActionState(giveConsentAction, initialState);
  const c = consentStep(form);
  const general = state.error && state.error !== "required" ? (state.error === "version_mismatch" ? c.versionMismatch : errors.generic(form)) : null;
  return (
    <form action={action} className="stack" noValidate>
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="version" value={version} />
      {returnTo ? <input type="hidden" name="return_to" value={returnTo} /> : null}
      <Checkbox name="agree" label={label} error={state.fields?.agree ? c.required : null} required />
      {general ? (
        <Notice tone="danger" live="assertive">
          {general}
        </Notice>
      ) : null}
      <div>
        <SubmitButton iconAfter="arrowRight" pendingLabel={actions.saving}>
          {c.submit}
        </SubmitButton>
      </div>
    </form>
  );
}
