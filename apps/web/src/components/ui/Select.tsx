import { useId, type ReactNode, type SelectHTMLAttributes } from "react";
import { FieldError } from "./Field";

export function Select({
  label,
  hint,
  error,
  options,
  id,
  ...select
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  options: { value: string; label: string }[];
} & SelectHTMLAttributes<HTMLSelectElement>) {
  const auto = useId();
  const fid = id ?? `s${auto}`;
  return (
    <div className="field">
      <label className="field__label" htmlFor={fid}>
        {label}
      </label>
      {hint ? (
        <p className="field__hint" id={`${fid}-hint`}>
          {hint}
        </p>
      ) : null}
      <select
        id={fid}
        className="select"
        aria-invalid={error ? true : undefined}
        aria-describedby={[hint && `${fid}-hint`, error && `${fid}-error`].filter(Boolean).join(" ") || undefined}
        {...select}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error ? <FieldError id={`${fid}-error`}>{error}</FieldError> : null}
    </div>
  );
}
