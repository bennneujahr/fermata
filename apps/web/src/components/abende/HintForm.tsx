"use client";
// Erkennungszeichen (freiwillig, höchstens 80 Zeichen). Das Gegenüber sieht es nur im Finde-Fenster.
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { recognitionHintAction } from "@/app/actions/abende";
import { Button, Field, Notice } from "@/components/ui";
import { abende } from "@/copy/abende";
import type { AddressForm } from "@/copy/form";
import { errorText } from "./errors";

export function HintForm({ eveningId, form, initial, max = 80 }: { eveningId: string; form: AddressForm; initial: string | null; max?: number }) {
  const c = abende(form);
  const router = useRouter();
  const [value, setValue] = useState(initial ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const save = () => {
    setMsg(null);
    start(async () => {
      const res = await recognitionHintAction(eveningId, value);
      if (!res.ok) {
        setMsg({ ok: false, text: errorText(c, res.error) });
        return;
      }
      setMsg({ ok: true, text: value.trim() ? c.hintSaved : c.hintRemoved });
      router.refresh();
    });
  };

  return (
    <form
      className="stack stack-sm"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <Field label={c.hintLabel} hint={c.hintHint(max)} value={value} onChange={(e) => setValue(e.target.value)} maxLength={max} name="hint" autoComplete="off" />
      <div className="cluster">
        <Button type="submit" variant="secondary" size="sm" loading={pending}>
          {c.hintSave}
        </Button>
        {msg?.ok ? (
          <span role="status" className="muted text-sm">
            {msg.text}
          </span>
        ) : null}
      </div>
      {msg && !msg.ok ? (
        <Notice tone="danger" live="assertive">
          {msg.text}
        </Notice>
      ) : null}
    </form>
  );
}
