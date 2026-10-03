"use client";
// Widerrufsbutton (§ 356a BGB), angemeldet: Schritt 1 Name, Vertrag und Kontaktweg (vorausgefüllt aus
// billing-withdraw preview, mit Berechnung), Schritt 2 „Widerruf bestätigen“ (confirm). ENTWURF.
import { useId, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { withdrawMembership } from "@/app/actions/billing";
import { Button, Field, Notice } from "@/components/ui";
import { errors as commonErrors } from "@/copy/common";
import type { AddressForm } from "@/copy/form";
import { LABELS, withdraw as withdrawCopy } from "@/copy/mitgliedschaft";
import type { WithdrawPreview, WithdrawResult } from "@/lib/billing-types";
import { formatReceipt } from "@/lib/datetime";
import { formatCents } from "@/lib/money";
import { FlowStep } from "./FlowStep";
import { Receipt } from "./Receipt";
import "./mitgliedschaft.css";

export function WithdrawForm({ form, preview, intro }: { form: AddressForm; preview: WithdrawPreview; intro?: ReactNode }) {
  const c = withdrawCopy(form);
  const uid = useId();
  const [name, setName] = useState(preview.name ?? "");
  const [contract, setContract] = useState(preview.contractNumber ?? "");
  const [email, setEmail] = useState(preview.email ?? "");
  const [fieldError, setFieldError] = useState<{ name?: string; contract?: string; email?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<(WithdrawResult & { email: string }) | null>(null);
  const [pending, start] = useTransition();

  function submit(e: FormEvent) {
    e.preventDefault();
    const fe: typeof fieldError = {};
    if (name.trim().length < 2) fe.name = c.errors.name_required;
    if (!contract.trim()) fe.contract = c.errors.contract_required;
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) fe.email = c.errors.invalid_email;
    setFieldError(fe);
    const first = fe.name ? "name" : fe.contract ? "contract" : fe.email ? "email" : null;
    if (first) {
      document.getElementById(`${uid}-${first}`)?.focus();
      return;
    }
    setError(null);
    start(async () => {
      const res = await withdrawMembership({ name, contractNumber: contract, contactEmail: email });
      if (res.ok) setDone({ ...res.data, email: email.trim() || preview.email || "" });
      else if (res.error === "contract_mismatch") {
        setFieldError({ contract: c.errors.contract_mismatch });
        document.getElementById(`${uid}-contract`)?.focus();
      } else setError(c.errors[res.error] ?? commonErrors.generic(form));
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
          {
            label: c.doneLabels.refund,
            value: `${formatCents(done.refundCents)} – ${c.refundStatus[done.refundCents > 0 ? done.refund : "none"] ?? done.refund}`,
          },
          { label: c.doneLabels.evenings, value: String(done.cancelledEvenings) },
        ]}
      >
        <p className="soft">{done.confirmationSent ? (done.email ? c.mailSent(done.email) : c.mailSentNoAddress) : c.mailFailed}</p>
      </Receipt>
    );
  }

  return (
    <form className="stack stack-lg" onSubmit={submit} noValidate aria-busy={pending || undefined}>
      {intro}
      <section className="card stack" aria-labelledby={`${uid}-s1`}>
        <FlowStep n={1} eyebrow={c.step1} title={c.step1Title} id={`${uid}-s1`} />
        <Field id={`${uid}-name`} label={c.name} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} error={fieldError.name} required />
        <Field
          id={`${uid}-contract`}
          label={c.contractNumber}
          value={contract}
          onChange={(e) => setContract(e.target.value)}
          error={fieldError.contract}
          autoCapitalize="characters"
          spellCheck={false}
          required
        />
        <Field
          id={`${uid}-email`}
          label={c.email}
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fieldError.email}
        />
      </section>

      <section className="card card--sunk stack" aria-labelledby={`${uid}-money`}>
        <h2 id={`${uid}-money`} className="card__title">
          {c.moneyTitle}
        </h2>
        <dl className="money">
          <div className="money__row">
            <dt>{c.money.paid}</dt>
            <dd>{formatCents(preview.paidCents)}</dd>
          </div>
          <div className="money__row">
            <dt>
              {c.money.value}
              <span className="money__detail">{c.valueDetail(preview.eveningsUsed, formatCents(preview.valuePerEveningCents))}</span>
            </dt>
            <dd>− {formatCents(preview.wertersatzCents)}</dd>
          </div>
          <div className="money__row money__row--total">
            <dt>{c.money.refund}</dt>
            <dd>{formatCents(preview.refundCents)}</dd>
          </div>
        </dl>
        <p className="soft text-sm">{c.moneyNote}</p>
        <h3>{c.whatTitle}</h3>
        <ul className="stack stack-sm">
          {c.what.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
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
            {LABELS.withdrawConfirm}
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
