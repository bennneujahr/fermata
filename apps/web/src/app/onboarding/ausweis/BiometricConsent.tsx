"use client";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { giveBiometricConsentAction } from "@/app/actions/onboarding";
import { initialState } from "@/app/actions/state";
import { Checkbox, Notice, SubmitButton } from "@/components/ui";
import { actions, errors } from "@/copy/common";
import type { AddressForm } from "@/copy/form";
import { consentStep } from "@/copy/onboarding";

export function BiometricConsent({ version, label, form }: { version: string; label: string; form: AddressForm }) {
  const [state, action] = useActionState(giveBiometricConsentAction, initialState);
  const router = useRouter();
  const c = consentStep(form);
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);
  return (
    <form action={action} className="stack" noValidate>
      <input type="hidden" name="version" value={version} />
      <Checkbox name="agree" label={label} error={state.fields?.agree ? c.required : null} required />
      {state.error && state.error !== "required" ? (
        <Notice tone="danger" live="assertive">
          {state.error === "version_mismatch" ? c.versionMismatch : errors.generic(form)}
        </Notice>
      ) : null}
      <div>
        <SubmitButton pendingLabel={actions.saving}>{c.submit}</SubmitButton>
      </div>
    </form>
  );
}
