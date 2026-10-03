import { useId, type ReactNode } from "react";
import { FieldError } from "./Field";

export interface Option {
  value: string;
  label: ReactNode;
  description?: ReactNode;
}

/** Gruppe aus Optionsfeldern (type radio) oder Häkchen (multiple) in einem fieldset mit legend. */
export function RadioGroup({
  legend,
  name,
  options,
  defaultValue,
  multiple,
  required,
  hint,
  error,
  inline,
}: {
  legend: ReactNode;
  name: string;
  options: Option[];
  defaultValue?: string | string[] | null;
  multiple?: boolean;
  required?: boolean;
  hint?: ReactNode;
  error?: string | null;
  inline?: boolean;
}) {
  const auto = useId();
  const gid = `g${auto}`;
  const selected = new Set(Array.isArray(defaultValue) ? defaultValue : defaultValue ? [defaultValue] : []);
  return (
    <fieldset
      className="fieldset"
      aria-describedby={[hint && `${gid}-hint`, error && `${gid}-error`].filter(Boolean).join(" ") || undefined}
    >
      <legend className="fieldset__legend">{legend}</legend>
      {hint ? (
        <p className="field__hint" id={`${gid}-hint`}>
          {hint}
        </p>
      ) : null}
      <div className={["choice-list", inline && "choice-list--inline"].filter(Boolean).join(" ")}>
        {options.map((o, i) => {
          const id = `${gid}-${i}`;
          return (
            <label className="choice" htmlFor={id} key={o.value}>
              <input
                className="choice__control"
                type={multiple ? "checkbox" : "radio"}
                id={id}
                name={name}
                value={o.value}
                defaultChecked={selected.has(o.value)}
                required={required && !multiple ? true : undefined}
                aria-invalid={error ? true : undefined}
              />
              <span className="choice__text">
                <span className="choice__label">{o.label}</span>
                {o.description ? <span className="choice__description">{o.description}</span> : null}
              </span>
            </label>
          );
        })}
      </div>
      {error ? <FieldError id={`${gid}-error`}>{error}</FieldError> : null}
    </fieldset>
  );
}
