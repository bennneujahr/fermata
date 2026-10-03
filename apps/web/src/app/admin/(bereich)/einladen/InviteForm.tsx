"use client";
import { useActionState } from "react";
import { inviteAction } from "@/app/actions/admin";
import { initialState } from "@/app/actions/state";
import { Field, Notice, SubmitButton } from "@/components/ui";
import { admin } from "@/copy/admin";
import { errors } from "@/copy/common";

export function InviteForm() {
  const [state, action] = useActionState(inviteAction, initialState);
  const c = admin.invite;
  return (
    <form action={action} className="stack" noValidate key={state.ok ? state.message : "form"}>
      <Field
        label={c.email}
        name="email"
        type="email"
        autoComplete="off"
        defaultValue={state.ok ? "" : (state.values?.email ?? "")}
        error={state.fields?.email ? c.errors[state.fields.email] : null}
        required
      />
      {state.ok ? (
        <Notice tone={state.fields?.mail === "failed" ? "warning" : "success"} live="polite">
          {state.fields?.mail === "failed" ? c.mailFailed : c.success(state.message ?? "")}
          {state.fields?.founding === "yes" ? ` ${c.founding}` : ""}
        </Notice>
      ) : state.error && !state.fields?.email ? (
        <Notice tone="danger" live="assertive">
          {c.errors[state.error] ?? errors.generic()}
        </Notice>
      ) : null}
      <div>
        <SubmitButton icon="send" pendingLabel={c.sending}>
          {c.submit}
        </SubmitButton>
      </div>
    </form>
  );
}
