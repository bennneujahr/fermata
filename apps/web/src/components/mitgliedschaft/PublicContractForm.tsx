"use client";
// Kündigen und Widerrufen ohne Anmeldung (/kuendigen, /widerrufen): billing-cancel bzw. billing-withdraw {action: "request"}.
// Die Antwort ist immer gleich (niemand erfährt, ob es den Vertrag gibt). Als Eingang gilt der Zeitpunkt des Formulars;
// bestätigt wird über den Link in der Mail (Knopf „Kündigung bestätigen“ bzw. „Widerruf bestätigen“). ENTWURF.
import { useId, useRef, useState, useTransition, type FormEvent } from "react";
import { requestCancellation, requestWithdrawal } from "@/app/actions/billing";
import { Button, Field, Notice, TextArea } from "@/components/ui";
import { errors as commonErrors } from "@/copy/common";
import { cancel as cancelCopy, cancelPublic, LABELS, withdraw as withdrawCopy, withdrawPublic } from "@/copy/mitgliedschaft";
import { dateAndTime } from "@/lib/datetime";
import { FlowStep } from "./FlowStep";
import "./mitgliedschaft.css";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function PublicContractForm({ kind }: { kind: "cancel" | "withdraw" }) {
  const isCancel = kind === "cancel";
  const pub = isCancel ? cancelPublic : withdrawPublic;
  const flow = isCancel ? cancelCopy("sie") : withdrawCopy("sie");
  const errorsCopy = flow.errors;
  const uid = useId();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [contract, setContract] = useState("");
  const [cancelKind, setCancelKind] = useState<"ordentlich" | "ausserordentlich">("ordentlich");
  const [reason, setReason] = useState("");
  const [fieldError, setFieldError] = useState<Record<string, string | undefined>>({});
  const [error, setError] = useState<string | null>(null);
  const [sentAt, setSentAt] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const doneRef = useRef<HTMLHeadingElement>(null);
  const kinds = cancelCopy("sie").kinds(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    const fe: Record<string, string | undefined> = {};
    if (name.trim().length < 2) fe.name = errorsCopy.name_required;
    if (!EMAIL.test(email.trim())) fe.email = errorsCopy.invalid_email;
    if (!contract.trim()) fe.contract = withdrawCopy("sie").errors.contract_required;
    if (isCancel && cancelKind === "ausserordentlich" && reason.trim().length < 3) fe.reason = cancelCopy("sie").errors.reason_required;
    setFieldError(fe);
    const first = ["name", "email", "contract", "reason"].find((k) => fe[k]);
    if (first) {
      document.getElementById(`${uid}-${first}`)?.focus();
      return;
    }
    setError(null);
    start(async () => {
      const res = isCancel
        ? await requestCancellation({ name, email, contractNumber: contract, kind: cancelKind, reason })
        : await requestWithdrawal({ name, email, contractNumber: contract });
      if (res.ok) {
        setSentAt(res.data.sentAt);
        requestAnimationFrame(() => doneRef.current?.focus());
      } else setError(errorsCopy[res.error] ?? commonErrors.generic("sie"));
    });
  }

  if (sentAt) {
    const { date, time } = dateAndTime(sentAt);
    return (
      <section className="card receipt stack" aria-labelledby={`${uid}-done`}>
        <h2 id={`${uid}-done`} ref={doneRef} tabIndex={-1}>
          {pub.sentTitle}
        </h2>
        <p className="receipt__time">{pub.sentAt(date, time)}</p>
        <p>{pub.sentText}</p>
        <p className="soft text-sm">{pub.noMail}</p>
        <div>
          <Button
            variant="quiet"
            onClick={() => {
              setSentAt(null);
            }}
          >
            {pub.again}
          </Button>
        </div>
      </section>
    );
  }

  return (
    <form className="stack stack-lg" onSubmit={submit} noValidate aria-busy={pending || undefined}>
      <section className="card stack" aria-labelledby={`${uid}-s1`}>
        <FlowStep n={1} eyebrow={flow.step1} title={flow.step1Title} id={`${uid}-s1`} />
        <Field id={`${uid}-name`} label={pub.name} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} error={fieldError.name} required />
        <Field
          id={`${uid}-email`}
          label={pub.email}
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fieldError.email}
          required
        />
        <Field
          id={`${uid}-contract`}
          label={pub.contractNumber}
          hint={pub.contractHint}
          value={contract}
          onChange={(e) => setContract(e.target.value)}
          error={fieldError.contract}
          autoCapitalize="characters"
          spellCheck={false}
          required
        />
        {isCancel ? (
          <>
            <fieldset className="fieldset">
              <legend className="fieldset__legend">{cancelCopy("sie").kindLegend}</legend>
              <div className="choice-list">
                {(["ordentlich", "ausserordentlich"] as const).map((k) => (
                  <label className="choice" htmlFor={`${uid}-kind-${k}`} key={k}>
                    <input
                      className="choice__control"
                      type="radio"
                      id={`${uid}-kind-${k}`}
                      name="kind"
                      value={k}
                      checked={cancelKind === k}
                      onChange={() => setCancelKind(k)}
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
              label={cancelCopy("sie").reason}
              optional={cancelKind === "ordentlich" ? cancelCopy("sie").reasonOptional : undefined}
              hint={cancelCopy("sie").reasonHint}
              className="textarea--prose"
              rows={3}
              maxLength={1000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              error={fieldError.reason}
            />
          </>
        ) : null}
      </section>

      <section className="card stack" aria-labelledby={`${uid}-s2`}>
        <FlowStep n={2} eyebrow={flow.step2} title={flow.step2Title} id={`${uid}-s2`} />
        <p className="soft">{pub.how}</p>
        {error ? (
          <Notice tone="danger" live="assertive">
            {error}
          </Notice>
        ) : null}
        <div>
          <Button type="submit" loading={pending}>
            {isCancel ? LABELS.cancelConfirm : LABELS.withdrawConfirm}
          </Button>
        </div>
      </section>
    </form>
  );
}
