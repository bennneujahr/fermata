"use client";
import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { initialState, type ActionState } from "@/app/actions/state";
import { Button, Dialog, Notice, SubmitButton, type ButtonVariant, type IconName } from "@/components/ui";
import { adminCommon as c } from "@/copy/admin-common";

export type AdminAction = (prev: ActionState, fd: FormData) => Promise<ActionState>;

export interface ConfirmSpec {
  title: string;
  text: string;
  confirmLabel: string;
  danger?: boolean;
}

/** Fehlertext zu einem Ergebnis: eigener Text zum hint, sonst die deutsche Meldung der Datenbank, sonst allgemein. */
export function resultError(state: ActionState, errors?: Record<string, string>): string | null {
  if (!state.error) return null;
  return errors?.[state.error] ?? (state.error === "db_message" && state.message ? state.message : (c.errors[state.error] ?? c.errors.generic!));
}

/**
 * Formular für eine Server Action im Admin: Absenden-Knopf mit Ladezustand, optional Rückfrage im Dialog,
 * Ergebnis als Hinweis (Erfolg höflich angesagt, Fehler sofort). Felder kommen als children.
 */
export function ActionForm({
  action,
  children,
  submitLabel,
  pendingLabel,
  variant,
  size,
  icon,
  confirm,
  errors,
  resetOnSuccess,
  className,
  submitName,
  submitValue,
  extraButtons,
  testId,
}: {
  action: AdminAction;
  children?: ReactNode;
  submitLabel: string;
  pendingLabel?: string;
  variant?: ButtonVariant;
  size?: "md" | "sm";
  icon?: IconName;
  confirm?: ConfirmSpec;
  errors?: Record<string, string>;
  resetOnSuccess?: boolean;
  className?: string;
  submitName?: string;
  submitValue?: string;
  extraButtons?: ReactNode;
  testId?: string;
}) {
  const [state, formAction] = useActionState(action, initialState);
  const form = useRef<HTMLFormElement>(null);
  const confirmed = useRef(false);
  const submitter = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (state.ok && resetOnSuccess) form.current?.reset();
  }, [state, resetOnSuccess]);

  const error = resultError(state, errors);
  return (
    <>
      <form
        ref={form}
        action={formAction}
        className={className ?? "stack stack-sm"}
        data-testid={testId}
        onSubmit={(e) => {
          if (!confirm) return;
          if (confirmed.current) {
            confirmed.current = false;
            return;
          }
          e.preventDefault();
          submitter.current = (e.nativeEvent as SubmitEvent).submitter ?? null;
          setOpen(true);
        }}
      >
        {children}
        <div className="cluster">
          <SubmitButton variant={variant} size={size} icon={icon} pendingLabel={pendingLabel ?? c.working} name={submitName} value={submitValue}>
            {submitLabel}
          </SubmitButton>
          {extraButtons}
        </div>
        {state.ok && state.message ? (
          <div className="action-form__result">
            <Notice tone="success" live="polite">
              {state.message}
            </Notice>
          </div>
        ) : null}
        {error ? (
          <div className="action-form__result">
            <Notice tone="danger" live="assertive">
              {error}
            </Notice>
          </div>
        ) : null}
      </form>
      {confirm ? (
        <Dialog
          open={open}
          onClose={() => setOpen(false)}
          title={confirm.title}
          actions={
            <>
              <Button variant="secondary" onClick={() => setOpen(false)}>
                {c.cancel}
              </Button>
              <Button
                variant={confirm.danger ? "danger" : "primary"}
                onClick={() => {
                  setOpen(false);
                  confirmed.current = true;
                  const s = submitter.current;
                  if (s instanceof HTMLButtonElement && form.current?.contains(s)) form.current.requestSubmit(s);
                  else form.current?.requestSubmit();
                }}
              >
                {confirm.confirmLabel}
              </Button>
            </>
          }
        >
          <p className="soft">{confirm.text}</p>
        </Dialog>
      ) : null}
    </>
  );
}
