"use client";
// Antwort auf Wunschzeiten: eine der angebotenen Uhrzeiten bestätigen oder eine Alternative vorschlagen.
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { confirmTimeAction } from "@/app/actions/abende";
import { Button, Notice } from "@/components/ui";
import { abende } from "@/copy/abende";
import type { AddressForm } from "@/copy/form";
import { formatEveningTime } from "@/lib/berlin";
import { errorText } from "./errors";
import { TimePicker } from "./TimePicker";

export function TimeAnswer({
  eveningId,
  form,
  offered,
  options,
  max,
  roundsLeft,
  now,
}: {
  eveningId: string;
  form: AddressForm;
  offered: string[];
  options: { starts_at: string; source: "proposed" | "shared_window" }[];
  max: number;
  roundsLeft: number;
  now: string;
}) {
  const c = abende(form);
  const router = useRouter();
  const gid = useId();
  const [choice, setChoice] = useState<string | null>(offered.length === 1 ? offered[0]! : null);
  const [error, setError] = useState<string | null>(null);
  const [counter, setCounter] = useState(false);
  const [pending, start] = useTransition();

  const confirm = () => {
    if (!choice) return;
    setError(null);
    start(async () => {
      const res = await confirmTimeAction(eveningId, choice);
      if (!res.ok) {
        setError(res.error);
        if (res.error === "invalid_state" || res.error === "not_your_turn") router.refresh();
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="stack">
      <fieldset className="fieldset">
        <legend className="fieldset__legend">{c.confirmLegend}</legend>
        <div className="choice-list">
          {offered.map((t, i) => (
            <label className="choice" key={t} htmlFor={`${gid}-${i}`}>
              <input
                id={`${gid}-${i}`}
                className="choice__control"
                type="radio"
                name={`${gid}-time`}
                value={t}
                checked={choice === t}
                onChange={() => setChoice(t)}
                disabled={pending}
              />
              <span className="choice__text">
                <span className="choice__label">{formatEveningTime(t, now)}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {error ? (
        <Notice tone="danger" live="assertive">
          {errorText(c, error, max)}
        </Notice>
      ) : null}
      <div className="cluster">
        <Button onClick={confirm} disabled={!choice} loading={pending} icon="check">
          {c.confirmTime}
        </Button>
        {roundsLeft > 0 ? (
          <Button variant="secondary" onClick={() => setCounter((v) => !v)} aria-expanded={counter}>
            {c.counterOpen}
          </Button>
        ) : null}
      </div>
      {roundsLeft > 0 ? <p className="muted text-sm">{c.roundsLeft(roundsLeft)}</p> : <p className="muted text-sm">{c.noRounds}</p>}
      {counter ? (
        <section className="stack counter-box" id={`${gid}-counter`} aria-labelledby={`${gid}-counter-title`}>
          <h3 id={`${gid}-counter-title`}>{c.counterTitle}</h3>
          <p className="soft" id={`${gid}-counter-lead`}>
            {c.counterLead(max)}
          </p>
          <TimePicker eveningId={eveningId} form={form} options={options} max={max} mode="counter" exclude={offered} legendId={`${gid}-counter-lead`} />
        </section>
      ) : null}
    </div>
  );
}
