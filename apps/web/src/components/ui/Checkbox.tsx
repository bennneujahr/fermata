import { useId, type InputHTMLAttributes, type ReactNode } from "react";
import { FieldError } from "./Field";

/** Einzelnes Häkchen mit Beschriftung (z. B. Einwilligung). */
export function Checkbox({
  label,
  description,
  error,
  plain,
  id,
  ...input
}: { label: ReactNode; description?: ReactNode; error?: string | null; plain?: boolean } & Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const auto = useId();
  const fid = id ?? `c${auto}`;
  return (
    <div className="field">
      <label className={["choice", plain && "choice--plain"].filter(Boolean).join(" ")} htmlFor={fid}>
        <input
          type="checkbox"
          id={fid}
          className="choice__control"
          aria-invalid={error ? true : undefined}
          aria-describedby={[description && `${fid}-desc`, error && `${fid}-error`].filter(Boolean).join(" ") || undefined}
          {...input}
        />
        <span className="choice__text">
          <span className="choice__label">{label}</span>
          {description ? (
            <span className="choice__description" id={`${fid}-desc`}>
              {description}
            </span>
          ) : null}
        </span>
      </label>
      {error ? <FieldError id={`${fid}-error`}>{error}</FieldError> : null}
    </div>
  );
}
