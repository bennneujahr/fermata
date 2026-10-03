"use client";
import { useEffect, useId, useState } from "react";
import { theme } from "@/copy/common";
import { THEME_KEY } from "./ThemeScript";

type Choice = "system" | "hell" | "dunkel";

/** Setzt data-theme am Wurzelelement (außerhalb von React, wie ThemeScript). */
function applyTheme(c: Choice): void {
  const root = document.documentElement;
  if (c === "hell") root.setAttribute("data-theme", "light");
  else if (c === "dunkel") root.setAttribute("data-theme", "dark");
  else root.removeAttribute("data-theme");
}

export function ThemeSwitcher() {
  const [choice, setChoice] = useState<Choice>("system");
  const id = useId();
  useEffect(() => {
    try {
      const v = localStorage.getItem(THEME_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Wert aus dem Gerät erst nach dem Laden bekannt
      if (v === "hell" || v === "dunkel") setChoice(v);
    } catch {
      /* ohne Speicher bleibt „wie das Gerät“ */
    }
  }, []);
  const apply = (c: Choice) => {
    setChoice(c);
    try {
      if (c === "system") localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, c);
    } catch {
      /* nicht speicherbar: gilt nur bis zum Neuladen */
    }
    applyTheme(c);
  };
  const options: { value: Choice; label: string }[] = [
    { value: "system", label: theme.system },
    { value: "hell", label: theme.light },
    { value: "dunkel", label: theme.dark },
  ];
  return (
    <fieldset className="fieldset" aria-describedby={`${id}-hint`}>
      <legend className="fieldset__legend">{theme.legend}</legend>
      <p className="field__hint" id={`${id}-hint`}>
        {theme.hint}
      </p>
      <div className="choice-list choice-list--inline">
        {options.map((o) => (
          <label key={o.value} className="choice" htmlFor={`${id}-${o.value}`}>
            <input
              className="choice__control"
              type="radio"
              id={`${id}-${o.value}`}
              name="theme"
              value={o.value}
              checked={choice === o.value}
              onChange={() => apply(o.value)}
            />
            <span className="choice__text">
              <span className="choice__label">{o.label}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
