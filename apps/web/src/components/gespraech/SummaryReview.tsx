"use client";
// Zusammenfassung lesen und bestätigen, korrigieren oder verwerfen (interview-summary).
// Solange der Hintergrund-Agent schreibt, fragt die Seite alle paar Sekunden nach.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { getSummaryAction, summaryDecisionAction } from "@/app/actions/gespraech";
import { Button, Dialog, Notice, TextArea } from "@/components/ui";
import type { AddressForm } from "@/copy/form";
import { summary as summaryCopy } from "@/copy/gespraech";
import type { SummaryInfo } from "@/lib/viola/types";

const POLL_MS = 2500;
const POLL_MAX = 48; // etwa zwei Minuten

export function SummaryReview({ initial, form, confirmedAt }: { initial: SummaryInfo; form: AddressForm; confirmedAt: string | null }) {
  const c = summaryCopy(form);
  const router = useRouter();
  const [info, setInfo] = useState(initial);
  const [polls, setPolls] = useState(0);
  const [mode, setMode] = useState<"view" | "correct">("view");
  const [text, setText] = useState(initial.summary_draft ?? "");
  const [error, setError] = useState<{ code: string; categories?: string[] } | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [confirmReject, setConfirmReject] = useState(false);
  const [pending, start] = useTransition();

  const waiting = info.summary_status === "none" && info.status !== "aborted" && info.analysis_status === "none" && polls < POLL_MAX;

  useEffect(() => {
    if (!waiting) return;
    const t = window.setTimeout(async () => {
      const res = await getSummaryAction(info.session_id);
      if (res.ok) {
        setInfo(res.data);
        if (res.data.summary_draft) setText(res.data.summary_draft);
      }
      setPolls((p) => p + 1);
    }, POLL_MS);
    return () => window.clearTimeout(t);
  }, [waiting, polls, info.session_id]);

  useEffect(() => {
    if (mode === "correct") document.getElementById("zusammenfassung-text")?.focus();
  }, [mode]);

  const decide = (action: "confirm" | "correct" | "reject") => {
    setError(null);
    start(async () => {
      const res = await summaryDecisionAction(info.session_id, action, action === "correct" ? text : undefined);
      if (!res.ok) {
        setError({ code: res.error, categories: res.categories });
        return;
      }
      setDone(action === "confirm" ? c.confirmed : action === "correct" ? c.corrected : c.rejected);
      setInfo((i) => ({ ...i, summary_status: res.summary_status as SummaryInfo["summary_status"] }));
      setMode("view");
      setConfirmReject(false);
      router.refresh();
    });
  };

  if (done) {
    return (
      <Notice tone="success" live="polite" title={done}>
        <Link href="/gespraech">{c.back}</Link>
      </Notice>
    );
  }

  if (info.summary_status === "confirmed" || info.summary_status === "corrected" || info.summary_status === "rejected") {
    return (
      <Notice tone={info.summary_status === "rejected" ? "info" : "success"}>
        {info.summary_status === "rejected" ? c.doneRejected : info.summary_status === "corrected" ? c.doneCorrected(confirmedAt ?? "") : c.doneConfirmed(confirmedAt ?? "")}
      </Notice>
    );
  }

  if (info.summary_status !== "draft" || !info.summary_draft) {
    return waiting ? (
      <div className="summary-waiting" role="status">
        <span className="btn__spinner" aria-hidden="true" />
        <div>
          <p className="summary-waiting__title">{c.waiting}</p>
          <p className="muted text-sm">{c.waitingText}</p>
        </div>
      </div>
    ) : (
      <Notice tone="info">
        {c.failed} <Link href="/gespraech">{c.back}</Link>
      </Notice>
    );
  }

  const art9 =
    error?.code === "art9_content"
      ? c.art9Text((error.categories ?? []).map((k) => c.art9Categories[k] ?? k).join(", ") || c.art9Fallback)
      : null;

  return (
    <div className="stack">
      {mode === "view" ? (
        <figure className="summary-draft">
          <figcaption className="eyebrow">{c.draftLabel}</figcaption>
          <blockquote className="summary-quote">{info.summary_draft}</blockquote>
        </figure>
      ) : (
        <TextArea
          id="zusammenfassung-text"
          label={c.correctLabel}
          hint={c.correctHint}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          minLength={20}
          maxLength={4000}
          className="textarea--prose"
          error={error && error.code !== "art9_content" ? (c.errors[error.code] ?? c.errors.generic) : null}
        />
      )}
      {art9 ? (
        <Notice tone="warning" live="assertive" title={c.art9Title}>
          {art9}
        </Notice>
      ) : error && mode === "view" ? (
        <Notice tone="danger" live="assertive">
          {c.errors[error.code] ?? c.errors.generic}
        </Notice>
      ) : null}
      {mode === "view" ? (
        <div className="cluster">
          <Button onClick={() => decide("confirm")} loading={pending} icon="check">
            {c.confirm}
          </Button>
          <Button variant="secondary" onClick={() => setMode("correct")} disabled={pending}>
            {c.correct}
          </Button>
          <Button variant="quiet" onClick={() => setConfirmReject(true)} disabled={pending}>
            {c.reject}
          </Button>
        </div>
      ) : (
        <div className="cluster">
          <Button onClick={() => decide("correct")} loading={pending} icon="check">
            {c.correctSubmit}
          </Button>
          <Button
            variant="quiet"
            onClick={() => {
              setMode("view");
              setError(null);
            }}
            disabled={pending}
          >
            {c.correctCancel}
          </Button>
        </div>
      )}
      <Dialog
        open={confirmReject}
        onClose={() => setConfirmReject(false)}
        title={c.rejectTitle}
        actions={
          <>
            <Button variant="secondary" onClick={() => setConfirmReject(false)}>
              {c.correctCancel}
            </Button>
            <Button variant="danger" onClick={() => decide("reject")} loading={pending}>
              {c.rejectConfirm}
            </Button>
          </>
        }
      >
        <p className="soft">{c.rejectText}</p>
      </Dialog>
    </div>
  );
}
