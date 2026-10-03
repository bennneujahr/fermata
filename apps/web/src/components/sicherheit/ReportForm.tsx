"use client";
// Formular „Etwas melden“ (api.report). Auf /sicherheit/melden und im Dialog des ReportButton.
// Bereich, Art (mit Erklärung zur Null-Toleranz), Beschreibung (freiwillig), Rückfrage gewünscht.
import Link from "next/link";
import { useId, useRef, useState, useTransition, type FormEvent } from "react";
import { submitReport } from "@/app/actions/safety";
import { Button, Checkbox, FieldError, Notice, Select, TextArea } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { errors } from "@/copy/common";
import type { AddressForm } from "@/copy/form";
import { categoryLabels, contextLabels, report as reportCopy } from "@/copy/sicherheit";
import { formatDateTime } from "@/lib/format";
import type { ReportCategory, ReportContext, ReportResult } from "@/lib/safety-types";
import { OTHER_CATEGORIES, REPORT_CONTEXTS, ZERO_TOLERANCE } from "@/lib/safety-types";
import "./sicherheit.css";

export interface ReportEveningOption {
  id: string;
  label: string;
  counterpartName: string | null;
}

const MAX = 4000;

export function ReportForm({
  form,
  evening,
  context: fixedContext,
  evenings = [],
  police = { number: "110", tel: "110" },
  onCancel,
  onDone,
  doneHeadingLevel = 2,
}: {
  form: AddressForm;
  /** Fester Abend (Meldung aus einem Abend heraus). */
  evening?: ReportEveningOption | null;
  /** Fester Bereich, z. B. „termin“ aus der Terminabstimmung oder „gespraech“ von der Gesprächsseite. */
  context?: ReportContext;
  /** Eigene Abende zur Auswahl (nur ohne festen Abend). */
  evenings?: ReportEveningOption[];
  police?: { number: string; tel: string };
  onCancel?: () => void;
  onDone?: (r: ReportResult) => void;
  doneHeadingLevel?: 2 | 3;
}) {
  const c = reportCopy(form);
  const uid = useId();
  const [context, setContext] = useState<ReportContext | "">(fixedContext ?? (evening ? "abend" : ""));
  const [eveningId, setEveningId] = useState<string>(evening?.id ?? "");
  const [about, setAbout] = useState<"person" | "other">("person");
  const [category, setCategory] = useState<ReportCategory | "">("");
  const [description, setDescription] = useState("");
  const [wantsContact, setWantsContact] = useState(true);
  const [fieldErrors, setFieldErrors] = useState<{ context?: string; category?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReportResult | null>(null);
  const [pending, start] = useTransition();
  const doneRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  const selected = evening ?? evenings.find((e) => e.id === eveningId) ?? null;
  const showEveningSelect = !evening && context === "abend" && evenings.length > 0;
  const showAbout = Boolean(selected) && (Boolean(evening) || context === "abend");

  function submit(e: FormEvent) {
    e.preventDefault();
    const fe: typeof fieldErrors = {};
    if (!context) fe.context = c.contextRequired;
    if (!category) fe.category = c.categoryRequired;
    setFieldErrors(fe);
    if (fe.context || fe.category) {
      const first = document.getElementById(fe.context ? `${uid}-ctx-0` : `${uid}-cat-0`);
      first?.focus();
      return;
    }
    setError(null);
    start(async () => {
      const res = await submitReport({
        context: context as ReportContext,
        category: category as ReportCategory,
        eveningId: evening ? evening.id : context === "abend" ? (selected?.id ?? null) : null,
        aboutCounterpart: showAbout && about === "person",
        description,
        wantsContact,
      });
      if (res.ok) {
        setResult(res.data);
        onDone?.(res.data);
        requestAnimationFrame(() => doneRef.current?.focus());
      } else {
        setError(c.errors[res.error] ?? errors.generic(form));
        requestAnimationFrame(() => errorRef.current?.focus());
      }
    });
  }

  if (result) {
    const H = `h${doneHeadingLevel}` as "h2" | "h3";
    return (
      <div className="stack" ref={doneRef} tabIndex={-1} role="status">
        <div className="cluster">
          <Icon name="checkCircle" size={28} className="text-success" />
          <H>{c.doneTitle}</H>
        </div>
        <p>{c.doneText(formatDateTime(result.due_at))}</p>
        {result.severity === "akut" ? <p>{c.doneUrgent}</p> : null}
        <p className="soft">
          {c.doneUnsafe} <Link href="/hilfe">{c.doneHelp}</Link>
        </p>
        <div className="cluster">
          <Link href="/sicherheit/meldungen">{c.doneReports}</Link>
          {onCancel ? (
            <Button variant="secondary" onClick={onCancel}>
              {c.close}
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <form className="stack" onSubmit={submit} noValidate aria-busy={pending || undefined}>
      <Notice tone="danger">
        <span className="report-emergency">
          <span>{c.emergency}</span>
          <a href={`tel:${police.tel}`}>{c.emergencyCta(police.number)}</a>
        </span>
      </Notice>

      {evening || (fixedContext && fixedContext !== "abend") ? (
        <p className="inline-icon">
          <Icon name={evening ? "evening" : "flag"} size={18} />
          <span>
            {evening ? c.eveningFixed(evening.label) : null}
            {fixedContext && fixedContext !== "abend" ? `${evening ? " · " : ""}${contextLabels[fixedContext]}` : null}
          </span>
        </p>
      ) : (
        <fieldset className="fieldset" aria-describedby={fieldErrors.context ? `${uid}-ctx-error` : undefined}>
          <legend className="fieldset__legend">{c.contextLegend}</legend>
          <div className="choice-list choice-list--inline">
            {REPORT_CONTEXTS.map((k, i) => (
              <label className="choice" htmlFor={`${uid}-ctx-${i}`} key={k}>
                <input
                  className="choice__control"
                  type="radio"
                  id={`${uid}-ctx-${i}`}
                  name="context"
                  value={k}
                  checked={context === k}
                  onChange={() => setContext(k)}
                  aria-invalid={fieldErrors.context ? true : undefined}
                />
                <span className="choice__text">
                  <span className="choice__label">{contextLabels[k]}</span>
                </span>
              </label>
            ))}
          </div>
          {fieldErrors.context ? <FieldError id={`${uid}-ctx-error`}>{fieldErrors.context}</FieldError> : null}
        </fieldset>
      )}

      {showEveningSelect ? (
        <Select
          label={c.eveningLabel}
          hint={c.eveningHint}
          value={eveningId}
          onChange={(e) => setEveningId(e.target.value)}
          options={[{ value: "", label: c.eveningNone }, ...evenings.map((e) => ({ value: e.id, label: e.label }))]}
        />
      ) : null}

      {showAbout ? (
        <fieldset className="fieldset">
          <legend className="fieldset__legend">{c.aboutLegend}</legend>
          <div className="choice-list">
            {(["person", "other"] as const).map((k) => (
              <label className="choice" htmlFor={`${uid}-about-${k}`} key={k}>
                <input
                  className="choice__control"
                  type="radio"
                  id={`${uid}-about-${k}`}
                  name="about"
                  value={k}
                  checked={about === k}
                  onChange={() => setAbout(k)}
                />
                <span className="choice__text">
                  <span className="choice__label">{k === "person" ? c.aboutPerson(selected?.counterpartName ?? null) : c.aboutOther}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      <fieldset className="fieldset" aria-describedby={[`${uid}-zero`, fieldErrors.category && `${uid}-cat-error`].filter(Boolean).join(" ")}>
        <legend className="fieldset__legend">{c.categoryLegend}</legend>
        <div className="category-group">
          <p className="category-group__title">
            <Icon name="shield" size={18} />
            <span>{c.zeroTitle}</span>
          </p>
          <p className="category-group__text" id={`${uid}-zero`}>
            {c.zeroText}
          </p>
          <div className="choice-list">
            {ZERO_TOLERANCE.map((k, i) => (
              <CategoryChoice key={k} id={`${uid}-cat-${i}`} value={k} checked={category === k} invalid={!!fieldErrors.category} onPick={setCategory} />
            ))}
          </div>
        </div>
        <div className="choice-list" role="group" aria-label={c.otherLegend}>
          {OTHER_CATEGORIES.map((k, i) => (
            <CategoryChoice
              key={k}
              id={`${uid}-cat-${ZERO_TOLERANCE.length + i}`}
              value={k}
              checked={category === k}
              invalid={!!fieldErrors.category}
              onPick={setCategory}
            />
          ))}
        </div>
        {fieldErrors.category ? <FieldError id={`${uid}-cat-error`}>{fieldErrors.category}</FieldError> : null}
      </fieldset>

      <div className="field">
        <TextArea
          label={c.description}
          optional={c.descriptionOptional}
          hint={c.descriptionHint}
          className="textarea--prose"
          rows={5}
          maxLength={MAX}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          describedBy={`${uid}-count`}
        />
        <span className="char-counter" id={`${uid}-count`} aria-live="off">
          {c.counter(description.length, MAX)}
        </span>
      </div>

      <Checkbox label={c.wantsContact} description={c.wantsContactHint} checked={wantsContact} onChange={(e) => setWantsContact(e.target.checked)} />

      <p className="soft text-sm">{c.anonymous}</p>

      {error ? (
        <div ref={errorRef} tabIndex={-1}>
          <Notice tone="danger" live="assertive">
            {error}
          </Notice>
        </div>
      ) : null}

      <div className="cluster">
        <Button type="submit" loading={pending} icon="send">
          {pending ? c.submitting : c.submit}
        </Button>
        {onCancel ? (
          <Button variant="quiet" onClick={onCancel} disabled={pending}>
            {c.cancel}
          </Button>
        ) : null}
      </div>
    </form>
  );
}

function CategoryChoice({
  id,
  value,
  checked,
  invalid,
  onPick,
}: {
  id: string;
  value: ReportCategory;
  checked: boolean;
  invalid: boolean;
  onPick: (v: ReportCategory) => void;
}) {
  const l = categoryLabels[value]!;
  return (
    <label className="choice" htmlFor={id}>
      <input
        className="choice__control"
        type="radio"
        id={id}
        name="category"
        value={value}
        checked={checked}
        onChange={() => onPick(value)}
        aria-invalid={invalid || undefined}
      />
      <span className="choice__text">
        <span className="choice__label">{l.label}</span>
        {l.description ? <span className="choice__description">{l.description}</span> : null}
      </span>
    </label>
  );
}
