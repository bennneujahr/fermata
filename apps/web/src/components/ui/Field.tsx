import { useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { Icon } from "./Icon";

interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  optional?: string;
  id?: string;
}

export function FieldError({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p className="field__error" id={id}>
      <Icon name="alert" size={18} />
      <span>{children}</span>
    </p>
  );
}

function describedBy(...ids: (string | false | undefined | null)[]) {
  const v = ids.filter(Boolean).join(" ");
  return v || undefined;
}

/** Eingabefeld mit Beschriftung, Hinweis und Fehlermeldung (verknüpft über aria-describedby). */
export function Field({ label, hint, error, optional, id, className, ...input }: FieldProps & InputHTMLAttributes<HTMLInputElement>) {
  const auto = useId();
  const fid = id ?? `f${auto}`;
  return (
    <div className="field">
      <label className="field__label" htmlFor={fid}>
        {label} {optional ? <span className="field__optional">({optional})</span> : null}
      </label>
      {hint ? (
        <p className="field__hint" id={`${fid}-hint`}>
          {hint}
        </p>
      ) : null}
      <input
        id={fid}
        className={["input", className].filter(Boolean).join(" ")}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(hint ? `${fid}-hint` : null, error ? `${fid}-error` : null)}
        {...input}
      />
      {error ? <FieldError id={`${fid}-error`}>{error}</FieldError> : null}
    </div>
  );
}

export function TextArea({ label, hint, error, optional, id, className, ...input }: FieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const auto = useId();
  const fid = id ?? `f${auto}`;
  return (
    <div className="field">
      <label className="field__label" htmlFor={fid}>
        {label} {optional ? <span className="field__optional">({optional})</span> : null}
      </label>
      {hint ? (
        <p className="field__hint" id={`${fid}-hint`}>
          {hint}
        </p>
      ) : null}
      <textarea
        id={fid}
        className={["textarea", className].filter(Boolean).join(" ")}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(hint ? `${fid}-hint` : null, error ? `${fid}-error` : null)}
        {...input}
      />
      {error ? <FieldError id={`${fid}-error`}>{error}</FieldError> : null}
    </div>
  );
}
