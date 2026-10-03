"use client";
// Öffentliche Bestätigung aus der Mail (/kuendigen/bestaetigen#t=… bzw. /widerrufen/bestaetigen#t=…).
// Der Schlüssel steht nur im Fragment; Öffnen zeigt den Vertrag, erst der Knopf schickt die Erklärung ab.
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { confirmContractLink, loadContractLink, type ContractLinkInfo } from "@/app/actions/billing";
import { Button, EmptyState, Notice, PageHeader, Skeleton } from "@/components/ui";
import { contractLink as copy } from "@/copy/mitgliedschaft";
import { formatReceipt } from "@/lib/datetime";
import { formatDateTime } from "@/lib/format";
import { tokenFromLocation } from "@/lib/safety-rules";
import "./mitgliedschaft.css";

type Kind = "cancel" | "withdraw";
type Done = { contractNumber: string | null; receivedAt: string | null; effectiveAt: string | null };
type State =
  | { kind: "loading" }
  | { kind: "missing" }
  | { kind: "invalid" }
  | { kind: "error" }
  | { kind: "ready"; token: string; info: ContractLinkInfo }
  | { kind: "done"; result: Done };

export function ContractLinkConfirm({ kind }: { kind: Kind }) {
  const t = copy[kind];
  const [state, setState] = useState<State>({ kind: "loading" });
  const [pending, start] = useTransition();
  const [confirmError, setConfirmError] = useState(false);
  const doneRef = useRef<HTMLHeadingElement>(null);

  const load = useCallback(async () => {
    const token = tokenFromLocation(window.location.hash, window.location.search);
    if (!token) {
      setState({ kind: "missing" });
      return;
    }
    setState({ kind: "loading" });
    const res = await loadContractLink(kind, token).catch(() => ({ ok: false as const, error: "network" }));
    if (!res.ok) setState({ kind: "error" });
    else if (!res.data.valid) setState({ kind: "invalid" });
    else setState({ kind: "ready", token, info: res.data });
  }, [kind]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- der Schlüssel steht nur im Browser (Fragment)
    void load();
  }, [load]);

  function confirm(token: string) {
    setConfirmError(false);
    start(async () => {
      const res = await confirmContractLink(kind, token).catch(() => ({ ok: false as const, error: "network" }));
      if (res.ok) {
        setState({ kind: "done", result: res.data });
        requestAnimationFrame(() => doneRef.current?.focus());
      } else if (res.error === "invalid_link") {
        setState({ kind: "invalid" });
      } else {
        setConfirmError(true);
      }
    });
  }

  if (state.kind === "loading") return <Skeleton lines={4} title label={copy.loading} />;
  if (state.kind === "missing") {
    return (
      <EmptyState title={copy.missingTitle} headingLevel={2}>
        <p>{copy.missingText}</p>
      </EmptyState>
    );
  }
  if (state.kind === "invalid") {
    return (
      <div className="stack">
        <PageHeader title={copy.invalidTitle} />
        <Notice tone="info">{copy.invalidText}</Notice>
        <p>
          <Link href={copy.again[kind].href}>{copy.again[kind].label}</Link>
        </p>
      </div>
    );
  }
  if (state.kind === "error") {
    return (
      <div className="stack">
        <PageHeader title={t.title} />
        <Notice tone="warning">{copy.errorText}</Notice>
        <div>
          <Button variant="secondary" onClick={() => void load()}>
            {copy.retry}
          </Button>
        </div>
      </div>
    );
  }
  if (state.kind === "done") {
    const r = state.result;
    return (
      <div className="stack">
        <h1 className="page-header__title" ref={doneRef} tabIndex={-1}>
          {t.doneTitle}
        </h1>
        <dl className="facts">
          {r.contractNumber ? (
            <>
              <dt>{copy.labels.contract}</dt>
              <dd>{r.contractNumber}</dd>
            </>
          ) : null}
          {r.receivedAt ? (
            <>
              <dt>{copy.labels.received}</dt>
              <dd>{formatReceipt(r.receivedAt)}</dd>
            </>
          ) : null}
          {r.effectiveAt ? (
            <>
              <dt>{t.effective}</dt>
              <dd>{formatDateTime(r.effectiveAt)}</dd>
            </>
          ) : null}
        </dl>
        <p>{t.doneText}</p>
      </div>
    );
  }
  const { token, info } = state;
  return (
    <div className="stack">
      <PageHeader title={t.title} lead={t.lead} />
      <dl className="facts">
        {info.contractNumber ? (
          <>
            <dt>{copy.labels.contract}</dt>
            <dd>{info.contractNumber}</dd>
          </>
        ) : null}
        {info.requestedAt ? (
          <>
            <dt>{copy.labels.requested}</dt>
            <dd>{formatReceipt(info.requestedAt)}</dd>
          </>
        ) : null}
      </dl>
      {confirmError ? <Notice tone="warning">{copy.errorText}</Notice> : null}
      <div>
        <Button onClick={() => confirm(token)} loading={pending}>
          {t.button}
        </Button>
      </div>
      <p className="soft">{copy.ignore}</p>
    </div>
  );
}
