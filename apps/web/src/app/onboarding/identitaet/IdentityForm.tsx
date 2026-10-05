"use client";
import { useActionState, useState } from "react";
import { saveIdentityAction } from "@/app/actions/onboarding";
import { initialState } from "@/app/actions/state";
import { Checkbox, Field, Notice, RadioGroup, Select, SubmitButton } from "@/components/ui";
import { actions, errors } from "@/copy/common";
import type { AddressForm } from "@/copy/form";
import { consentStep, identityStep } from "@/copy/onboarding";
import { Markdown } from "@/lib/markdown";
import type { Identity, LegalDocument } from "@/lib/types";

export function IdentityForm({
  form,
  identity,
  religionDoc,
  religionGranted,
  returnTo,
}: {
  form: AddressForm;
  identity: Identity | null;
  religionDoc: LegalDocument | null;
  religionGranted: boolean;
  returnTo?: string;
}) {
  const [state, action] = useActionState(saveIdentityAction, initialState);
  const [religionOpen, setReligionOpen] = useState(Boolean(state.values?.religion));
  const c = identityStep(form);
  const cc = consentStep(form);
  const seekingDefault = state.values?.seeking ? state.values.seeking.split(",") : (identity?.seeking ?? []);
  const general = state.error && state.error !== "validation" ? (c.errors[state.error] ?? errors.generic(form)) : null;

  return (
    <form action={action} className="stack stack-lg" noValidate>
      {returnTo ? <input type="hidden" name="return_to" value={returnTo} /> : null}
      <RadioGroup
        legend={c.gender}
        name="gender"
        inline
        defaultValue={state.values?.gender ?? identity?.gender ?? null}
        options={Object.entries(c.genders).map(([value, label]) => ({ value, label }))}
        error={state.fields?.gender ? c.errors.gender : null}
      />
      <RadioGroup
        legend={c.seeking}
        hint={c.seekingHint}
        name="seeking"
        multiple
        inline
        defaultValue={seekingDefault}
        options={Object.entries(c.seekingOptions).map(([value, label]) => ({ value, label }))}
        error={state.fields?.seeking ? c.errors.seeking : null}
      />
      <Select
        label={c.orientation}
        hint={c.orientationHint}
        name="orientation"
        defaultValue={state.values?.orientation ?? identity?.orientation ?? ""}
        options={Object.entries(c.orientations).map(([value, label]) => ({ value, label }))}
      />
      <RadioGroup
        legend={c.addressForm}
        hint={c.addressFormHint}
        name="address_form"
        inline
        defaultValue={state.values?.address_form ?? form}
        options={Object.entries(c.addressForms).map(([value, label]) => ({ value, label }))}
      />

      <details className="card card--sunk" open={religionOpen || undefined} onToggle={(e) => setReligionOpen(e.currentTarget.open)}>
        <summary className="field__label">{c.religionToggle}</summary>
        <div className="stack">
          <p className="soft">{c.religionLead}</p>
          {religionDoc ? (
            <div className="doc-box" tabIndex={0} aria-label={religionDoc.title}>
              <Markdown source={religionDoc.body_markdown} />
            </div>
          ) : null}
          <input type="hidden" name="religion_version" value={religionDoc?.version ?? ""} />
          <Checkbox
            name="religion_consent"
            label={cc.checkbox.art9_religion}
            defaultChecked={religionGranted}
            error={state.fields?.religion ? c.religionConsentMissing : null}
          />
          <Field label={c.religion} name="religion" defaultValue={state.values?.religion ?? ""} maxLength={80} />
          <Select
            label={c.religionImportance}
            name="religion_importance"
            defaultValue={state.values?.religion_importance ?? ""}
            options={Object.entries(c.importances).map(([value, label]) => ({ value, label }))}
          />
          <Checkbox name="religion_must_match" label={c.religionMustMatch} plain />
        </div>
      </details>

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
