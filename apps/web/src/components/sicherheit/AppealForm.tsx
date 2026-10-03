"use client";
// Widerspruch gegen eine Sanktion (api.appeal, einmal je Sanktion, 10–4000 Zeichen).
import { useId, useState, useTransition, type FormEvent } from "react";
import { submitAppeal } from "@/app/actions/safety";
import { Button, Notice, TextArea } from "@/components/ui";
import { errors } from "@/copy/common";
import type { AddressForm } from "@/copy/form";
import { sanctions as sanctionsCopy } from "@/copy/sicherheit";
import "./sicherheit.css";

const MIN = 10;
const MAX = 4000;

export function AppealForm({ form, sanctionId }: { form: AddressForm; sanctionId: string }) {
  const c = sanctionsCopy(form);
  const uid = useId();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();

  function submit(e: FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (t.length < MIN || t.length > MAX) {
      setError(c.errors.invalid_text!);
      return;
    }
    setError(null);
    start(async () => {
      const res = await submitAppeal(sanctionId, t);
      if (res.ok) setDone(true);
      else setError(c.errors[res.error] ?? errors.generic(form));
    });
  }

  if (done) {
    return (
      <Notice tone="success" live="polite">
        {c.appealDone}
      </Notice>
    );
  }

  return (
    <form className="stack stack-sm" onSubmit={submit} noValidate>
      <TextArea
        id={`${uid}-text`}
        label={c.appealLabel}
        hint={c.appealHint}
        className="textarea--prose"
        rows={4}
        minLength={MIN}
        maxLength={MAX}
        value={text}
        onChange={(e) => setText(e.target.value)}
        error={error}
      />
      <div>
        <Button type="submit" variant="secondary" loading={pending} icon="send">
          {pending ? c.appealSubmitting : c.appealSubmit}
        </Button>
      </div>
    </form>
  );
}
