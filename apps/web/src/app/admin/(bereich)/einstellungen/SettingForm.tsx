"use client";
import { useActionState } from "react";
import { updateSettingAction } from "@/app/actions/admin";
import { initialState } from "@/app/actions/state";
import { SubmitButton, TextArea } from "@/components/ui";
import { admin } from "@/copy/admin";
import { errors } from "@/copy/common";

export function SettingForm({ settingKey, value }: { settingKey: string; value: string }) {
  const [state, action] = useActionState(updateSettingAction, initialState);
  const c = admin.settings;
  const current = state.values?.value ?? value;
  return (
    <form action={action} className="stack stack-sm">
      <input type="hidden" name="key" value={settingKey} />
      <TextArea
        label={`${c.value}: ${settingKey}`}
        name="value"
        defaultValue={current}
        key={current}
        rows={Math.min(8, Math.max(2, Math.ceil(current.length / 48)))}
        spellCheck={false}
        error={state.error ? (c.errors[state.error] ?? errors.generic()) : null}
      />
      <div className="cluster">
        <SubmitButton variant="secondary" size="sm">
          {c.save}
        </SubmitButton>
        {state.ok ? (
          <span role="status" className="muted text-sm">
            {c.saved}
          </span>
        ) : null}
      </div>
    </form>
  );
}
