"use client";
import { useActionState } from "react";
import { deleteAccountAction } from "@/app/actions/account";
import { initialState } from "@/app/actions/state";
import { ButtonLink, Checkbox, Notice, SubmitButton } from "@/components/ui";
import { errors } from "@/copy/common";
import type { AddressForm } from "@/copy/form";
import { deletion } from "@/copy/member";

export function DeleteForm({ form }: { form: AddressForm }) {
  const [state, action] = useActionState(deleteAccountAction, initialState);
  const c = deletion(form);
  const message = state.error === "confirm" ? null : state.error === "admin_account" ? c.adminNotPossible : state.error ? errors.generic(form) : null;
  return (
    <form action={action} className="stack" noValidate>
      <Checkbox name="confirm" label={c.confirmLabel} error={state.fields?.confirm ? c.confirmRequired : null} required />
      <p className="muted text-sm">{c.mailNote}</p>
      {message ? (
        <Notice tone="danger" live="assertive">
          {message}
        </Notice>
      ) : null}
      <div className="cluster">
        <SubmitButton variant="danger" icon="trash" pendingLabel={c.deleting}>
          {c.submit}
        </SubmitButton>
        <ButtonLink href="/konto" variant="secondary">
          {c.cancel}
        </ButtonLink>
      </div>
    </form>
  );
}
