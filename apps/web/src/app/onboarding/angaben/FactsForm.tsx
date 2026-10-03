"use client";
import { useActionState, useRef, useState } from "react";
import { lookupPostalCodeAction, saveFactsAction } from "@/app/actions/onboarding";
import { initialState } from "@/app/actions/state";
import { Field, Notice, SubmitButton } from "@/components/ui";
import { actions, errors } from "@/copy/common";
import type { AddressForm } from "@/copy/form";
import { factsStep } from "@/copy/onboarding";
import type { Facts } from "@/lib/types";

export function FactsForm({ form, facts, collectStreet, locked, returnTo }: { form: AddressForm; facts: Facts | null; collectStreet: boolean; locked: boolean; returnTo?: string }) {
  const [state, action] = useActionState(saveFactsAction, initialState);
  const c = factsStep(form);
  const v = (k: keyof Facts) => state.values?.[k] ?? (facts?.[k] as string | null | undefined) ?? "";
  const [city, setCity] = useState<string>(v("city"));
  const suggested = useRef<string | null>(null);
  const err = (k: string) => {
    const key = state.fields?.[k];
    if (!key) return null;
    return key === "required" ? c.required : (c.errors[key] ?? errors.generic(form));
  };
  const general = state.error && state.error !== "validation" && !state.fields ? (c.errors[state.error] ?? errors.generic(form)) : null;

  async function onPostalCode(value: string) {
    if (!/^[0-9]{5}$/.test(value)) return;
    const found = await lookupPostalCodeAction(value);
    if (!found) return;
    // Ort nur vorschlagen, wenn das Feld leer ist oder noch den letzten Vorschlag enthält.
    if (city === "" || city === suggested.current) {
      setCity(found.place);
      suggested.current = found.place;
    }
  }

  return (
    <form action={action} className="stack" noValidate>
      {returnTo ? <input type="hidden" name="return_to" value={returnTo} /> : null}
      {locked ? <Notice tone="info">{c.locked}</Notice> : null}
      <div className="field-row">
        <Field label={c.firstName} hint={c.firstNameHint} name="first_name" autoComplete="given-name" defaultValue={v("first_name")} required readOnly={locked} error={err("first_name")} />
        <Field label={c.lastName} name="last_name" autoComplete="family-name" defaultValue={v("last_name")} required readOnly={locked} error={err("last_name")} />
      </div>
      <Field label={c.birthDate} hint={c.birthDateHint} name="birth_date" type="date" autoComplete="bday" defaultValue={v("birth_date")} required readOnly={locked} error={err("birth_date")} max="2099-12-31" />
      {collectStreet ? <Field label={c.street} name="street" autoComplete="street-address" defaultValue={v("street")} error={err("street")} /> : null}
      <div className="field-row field-row--plz">
        <Field
          label={c.postalCode}
          name="postal_code"
          inputMode="numeric"
          autoComplete="postal-code"
          pattern="[0-9]{5}"
          maxLength={5}
          defaultValue={v("postal_code")}
          required
          describedBy="plz-hinweis"
          error={err("postal_code")}
          onBlur={(e) => onPostalCode(e.currentTarget.value.trim())}
        />
        <Field label={c.city} name="city" autoComplete="address-level2" value={city} onChange={(e) => setCity(e.target.value)} error={err("city")} />
      </div>
      <p className="field__hint field__hint--row" id="plz-hinweis">
        {c.postalCodeHint}
      </p>
      <Field label={c.phone} hint={c.phoneHint} name="phone" type="tel" autoComplete="tel" inputMode="tel" defaultValue={v("phone")} error={err("phone")} />
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
