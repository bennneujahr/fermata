"use client";
// Uhrzeiten wählen (Wunsch oder Alternative): 1 bis max Häkchen, nach Tagen gruppiert (Ortszeit Berlin).
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { counterAction, requestTimeAction } from "@/app/actions/abende";
import { Badge, Button, Notice } from "@/components/ui";
import { abende } from "@/copy/abende";
import type { AddressForm } from "@/copy/form";
import { berlinDateKey, formatClock, formatDateKeyLong } from "@/lib/berlin";
import { toggleTime } from "@/lib/evening-types";
import { errorText } from "./errors";

export function TimePicker({
  eveningId,
  form,
  options,
  max,
  mode,
  exclude = [],
  legendId,
}: {
  eveningId: string;
  form: AddressForm;
  options: { starts_at: string; source: "proposed" | "shared_window" }[];
  max: number;
  mode: "request" | "counter";
  exclude?: string[];
  legendId?: string;
}) {
  const c = abende(form);
  const router = useRouter();
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const excluded = useMemo(() => new Set(exclude.map((t) => new Date(t).getTime())), [exclude]);
  const days = useMemo(() => {
    const map = new Map<string, typeof options>();
    for (const o of options) {
      if (excluded.has(new Date(o.starts_at).getTime())) continue;
      const k = berlinDateKey(o.starts_at);
      map.set(k, [...(map.get(k) ?? []), o]);
    }
    return [...map.entries()];
  }, [options, excluded]);

  if (!days.length) return <Notice tone="info">{c.noOptions}</Notice>;

  const submit = () => {
    setError(null);
    start(async () => {
      const res = mode === "request" ? await requestTimeAction(eveningId, picked) : await counterAction(eveningId, picked);
      if (!res.ok) {
        setError(res.error);
        if (res.error === "invalid_state" || res.error === "not_your_turn") router.refresh();
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="stack time-picker">
      {days.map(([day, list]) => (
        <fieldset key={day} className="fieldset time-picker__day" aria-describedby={legendId}>
          <legend className="fieldset__legend">{formatDateKeyLong(day)}</legend>
          <div className="choice-list choice-list--inline">
            {list.map((o) => {
              const checked = picked.includes(o.starts_at);
              const disabled = !checked && picked.length >= max;
              return (
                <label className="choice time-choice" key={o.starts_at} data-disabled={disabled || undefined}>
                  <input
                    className="choice__control"
                    type="checkbox"
                    name="times"
                    value={o.starts_at}
                    checked={checked}
                    disabled={disabled || pending}
                    onChange={() => setPicked((p) => toggleTime(p, o.starts_at, max))}
                  />
                  <span className="choice__text">
                    <span className="choice__label">{formatClock(o.starts_at)}</span>
                    {o.source === "proposed" ? (
                      <span>
                        <Badge tone="brass">{c.proposedBadge}</Badge>
                      </span>
                    ) : (
                      <span className="choice__description">{c.sharedBadge}</span>
                    )}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}
      <p className="muted text-sm" aria-live="polite">
        {c.chosen(picked.length, max)}
      </p>
      {error ? (
        <Notice tone="danger" live="assertive">
          {errorText(c, error, max)}
        </Notice>
      ) : null}
      <div>
        <Button onClick={submit} disabled={!picked.length} loading={pending} iconAfter="arrowRight">
          {mode === "request" ? c.sendTimes : c.counterSend}
        </Button>
      </div>
    </div>
  );
}
