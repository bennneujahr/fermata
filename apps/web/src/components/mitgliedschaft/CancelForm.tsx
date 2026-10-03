"use client";
// Kündigungsknopf (§ 312k BGB), angemeldet: Schritt 1 Angaben (vorausgefüllt aus billing-cancel preview),
// Schritt 2 „Jetzt kündigen“ (billing-cancel confirm). Danach Eingangsbestätigung mit Datum und Uhrzeit. ENTWURF.
import { useId, useState, useTransition, type FormEvent } from "react";
import { cancelMembership } from "@/app/actions/billing";
import { Button, Field, Notice, TextArea } from "@/components/ui";
import { errors as commonErrors } from "@/copy/common";
import type { AddressForm } from "@/copy/form";
import { cancel as cancelCopy, LABELS } from "@/copy/mitgliedschaft";
import type { CancelPreview, CancelResult } from "@/lib/billing-types";
import { formatReceipt } from "@/lib/datetime";
import { formatDate } from "@/lib/format";
import { FlowStep } from "./FlowStep";
import { Receipt } from "./Receipt";
import "./mitgliedschaft.css";

export function CancelForm({ form, preview }: { form: AddressForm; preview: CancelPreview }) {
  const c = cancelCopy(form);
  const uid = useId();
  const effective = preview.immediate ? c.effectiveNow : preview.effective_at ? formatDate(preview.effective_at) : "–";
  const kinds = c.kinds(preview.immediate ? null : preview.effective_at ? formatDate(preview.effective_at) : null);
  const [name, setName] = useState(preview.name ?? "");
  const [email, setEmail] = useState(preview.email ?? "");
  const [kind, setKind] = useState<"ordentlich" | "ausserordentlich">("ordentlich");
  const [reason, setReason] = useState("");
  const [fieldError, setFieldError] = useState<{ reason?: string; email?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<(CancelResult & { email: string }) | null>(null);
  const [pending, start] = useTransition();

  function submit(e: FormEvent) {
    e.preventDefault();
    const fe: typeof fieldError = {};
    if (kind === "ausserordentlich" && reason.trim().length < 3) fe.reason = c.errors.reason_required;
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) fe.email = c.errors.invalid_email;
    setFieldError(fe);
    if (fe.reason || fe.email) {
      document.getElementById(fe.reason ? `${uid}-reason` : `${uid}-email`)?.focus();
      return;
    }
    setError(null);
    start(async () => {
      const res = await cancelMembership({ kind, reason, name, contactEmail: email });
      if (res.ok) setDone({ ...res.data, email: email.trim() || preview.email || "" });
      else setError(c.errors[res.error] ?? commonErrors.generic(form));
    });
  }

  if (done) {
    return (
      <Receipt
        title={c.doneTitle}
        printLabel={c.print}
        rows={[
          { label: c.doneLabels.received, value: formatReceipt(done.receivedAt), strong: true },
          { label: c.doneLabels.contract, value: done.contractNumber },
          { label: c.doneLabels.kind, value: c.kindNames[done.kind] ?? done.kind },
          { label: c.doneLabels.effective, value: done.immediate ? c.effectiveNow : formatDate(done.effectiveAt) },
        ]}
      >
        <p className="soft">{done.confirmationSent ? (done.email ? c.mailSent(done.email) : c.mailSentNoAddress) : c.mailFailed}</p>
      </Receipt>
    );
  }

  return (
    <form className="stack stack-lg" onSubmit={submit} noValidate aria-busy={pending || undefined}>
      <section className="card stack" aria-labelledby={`${uid}-s1`}>
        <FlowStep n={1} eyebrow={c.step1} title={c.step1Title} id={`${uid}-s1`} />
        <dl className="facts">
          <dt>{c.contract}</dt>
          <dd>{c.contractValue(preview.contract_number ?? "–", preview.tier_name)}</dd>
          <dt>{c.effective}</dt>
          <dd>{effective}</dd>
        </dl>
        <Field label={c.name} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
        <Field
          id={`${uid}-email`}
          label={c.email}
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fieldError.email}
        />
        <fieldset className="fieldset">
          <legend className="fieldset__legend">{c.kindLegend}</legend>
          <div className="choice-list">
            {(["ordentlich", "ausserordentlich"] as const).map((k) => (
              <label className="choice" htmlFor={`${uid}-kind-${k}`} key={k}>
                <input
                  className="choice__control"
                  type="radio"
                  id={`${uid}-kind-${k}`}
                  name="kind"
                  value={k}
                  checked={kind === k}
                  onChange={() => setKind(k)}
                />
                <span className="choice__text">
                  <span className="choice__label">{kinds[k].label}</span>
                  <span className="choice__description">{kinds[k].description}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <TextArea
          id={`${uid}-reason`}
          label={c.reason}
          optional={kind === "ordentlich" ? c.reasonOptional : undefined}
          hint={c.reasonHint}
          className="textarea--prose"
          rows={3}
          maxLength={1000}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          error={fieldError.reason}
          aria-required={kind === "ausserordentlich" || undefined}
        />
      </section>

      <section className="card stack" aria-labelledby={`${uid}-s2`}>
        <FlowStep n={2} eyebrow={c.step2} title={c.step2Title} id={`${uid}-s2`} />
        <p className="soft">{c.step2Text}</p>
        {error ? (
          <Notice tone="danger" live="assertive">
            {error}
          </Notice>
        ) : null}
        <div>
          <Button type="submit" loading={pending}>
            {LABELS.cancelConfirm}
          </Button>
        </div>
        {pending ? (
          <p className="soft text-sm" role="status">
            {c.submitting}
          </p>
        ) : null}
      </section>
    </form>
  );
}
