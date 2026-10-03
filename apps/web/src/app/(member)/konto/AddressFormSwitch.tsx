"use client";
import { useActionState } from "react";
import { saveAddressFormAction } from "@/app/actions/account";
import { initialState } from "@/app/actions/state";
import { Notice, RadioGroup, SubmitButton } from "@/components/ui";
import { actions } from "@/copy/common";
import { konto } from "@/copy/member";
import { identityStep } from "@/copy/onboarding";
import type { AddressForm } from "@/copy/form";

export function AddressFormSwitch({ current }: { current: AddressForm }) {
  const [state, action] = useActionState(saveAddressFormAction, initialState);
  const c = identityStep(current);
  return (
    <form action={action} className="stack stack-sm">
      <RadioGroup
        legend={c.addressForm}
        name="address_form"
        inline
        defaultValue={current}
        options={[
          { value: "sie", label: c.addressForms.sie },
          { value: "du", label: c.addressForms.du },
        ]}
      />
      <div className="cluster">
        <SubmitButton variant="secondary" size="sm" pendingLabel={actions.saving}>
          {actions.save}
        </SubmitButton>
        {state.ok ? (
          <span role="status" className="muted text-sm">
            {konto(current).addressFormSaved}
          </span>
        ) : null}
      </div>
      {state.error ? <Notice tone="danger" live="assertive">{state.error}</Notice> : null}
    </form>
  );
}
