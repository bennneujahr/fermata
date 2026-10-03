"use client";
// Vorschlag ablehnen oder bestätigten Abend absagen – mit freiwilligem Grund (nur für Fermata).
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { cancelAction, declineAction } from "@/app/actions/abende";
import { Button, Dialog, Notice } from "@/components/ui";
import { abende } from "@/copy/abende";
import type { AddressForm } from "@/copy/form";
import { DECLINE_REASONS } from "@/lib/evening-types";
import { errorText } from "./errors";

export function EndEvening({
  eveningId,
  form,
  kind,
  counterpartName,
  explanation,
  reportHref,
}: {
  eveningId: string;
  form: AddressForm;
  kind: "decline" | "cancel";
  counterpartName: string | null;
  /** Bei Absage: rechtzeitig oder kurzfristig, mit Folgen (aus late_cancel_from berechnet). */
  explanation?: string[];
  reportHref: string;
}) {
  const c = abende(form);
  const router = useRouter();
  const gid = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = () => {
    setError(null);
    start(async () => {
      const res = kind === "decline" ? await declineAction(eveningId, reason) : await cancelAction(eveningId, reason);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <>
      <Button variant="quiet" onClick={() => setOpen(true)} icon={kind === "cancel" ? "trash" : undefined}>
        {kind === "decline" ? c.declineOpen : c.cancelOpen}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={kind === "decline" ? c.declineTitle : c.cancelTitle}
        actions={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
              {c.keep}
            </Button>
            <Button variant="danger" onClick={submit} loading={pending}>
              {kind === "decline" ? c.declineConfirm : c.cancelConfirm}
            </Button>
          </>
        }
      >
        {kind === "decline" ? (
          <p className="soft">{c.declineText(counterpartName)}</p>
        ) : (
          <div className="stack stack-sm">
            {(explanation ?? []).map((t) => (
              <p key={t} className="soft">
                {t}
              </p>
            ))}
            <p className="soft">{c.cancelInfo}</p>
          </div>
        )}
        <fieldset className="fieldset">
          <legend className="fieldset__legend">{c.reasonLegend}</legend>
          <div className="choice-list">
            {DECLINE_REASONS.map((r, i) => (
              <label className="choice" key={r} htmlFor={`${gid}-${i}`}>
                <input
                  id={`${gid}-${i}`}
                  className="choice__control"
                  type="radio"
                  name={`${gid}-reason`}
                  value={r}
                  checked={reason === r}
                  onChange={() => setReason(r)}
                />
                <span className="choice__text">
                  <span className="choice__label">{c.reasons[r]}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        {reason === "sicherheit" ? (
          <p className="soft text-sm">
            {kind === "cancel" ? c.cancelSafety : c.reasonSafetyHint} <Link href={reportHref}>{c.reportLink}</Link>
          </p>
        ) : null}
        {error ? (
          <Notice tone="danger" live="assertive">
            {errorText(c, error)}
          </Notice>
        ) : null}
      </Dialog>
    </>
  );
}
