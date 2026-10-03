"use client";
// Öffentliche Seite für Partner-Lokale (/lokal/bestaetigen#t=…): Reservierung ansehen und mit einem Klick bestätigen.
// Bloßes Öffnen bestätigt nichts (Link-Vorschauen in Mailprogrammen); erst der Knopf schickt POST an venue-confirm.
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { confirmVenueReservation, loadVenueReservation } from "@/app/actions/safety";
import { Button, Card, EmptyState, Notice, PageHeader, Skeleton } from "@/components/ui";
import { venueConfirm as copy } from "@/copy/sicherheit";
import { formatDate } from "@/lib/format";
import { formatReceipt, formatTime } from "@/lib/datetime";
import { tokenFromLocation } from "@/lib/safety-rules";
import type { VenueReservation } from "@/lib/safety-types";
import "./sicherheit.css";

type State =
  | { kind: "loading" }
  | { kind: "missing" }
  | { kind: "invalid" }
  | { kind: "error" }
  | { kind: "ready"; token: string; reservation: VenueReservation | null }
  | { kind: "done"; reservation: VenueReservation | null; already: boolean };

function Details({ r }: { r: VenueReservation }) {
  return (
    <dl className="facts">
      {r.venue_name ? (
        <>
          <dt>{copy.labels.venue}</dt>
          <dd>{r.venue_name}</dd>
        </>
      ) : null}
      <dt>{copy.labels.date}</dt>
      <dd>{formatDate(r.starts_at)}</dd>
      <dt>{copy.labels.time}</dt>
      <dd>{formatTime(r.starts_at)}</dd>
      <dt>{copy.labels.name}</dt>
      <dd>{r.reservation_name ?? "–"}</dd>
      <dt>{copy.labels.code}</dt>
      <dd className="venue-code">{r.table_code ?? "–"}</dd>
      <dt>{copy.labels.persons}</dt>
      <dd>{copy.personsValue(r.persons ?? 2)}</dd>
    </dl>
  );
}

export function VenueConfirmClient() {
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
    const res = await loadVenueReservation(token).catch(() => ({ ok: false as const, error: "network" }));
    if (!res.ok) setState({ kind: "error" });
    else if (!res.data.valid) setState({ kind: "invalid" });
    else if (res.data.reservation?.venue_confirmed_at) setState({ kind: "done", reservation: res.data.reservation, already: true });
    else setState({ kind: "ready", token, reservation: res.data.reservation });
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- der Schlüssel steht nur im Browser (Fragment)
    void load();
    const onHash = () => void load();
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [load]);

  function confirm(token: string, current: VenueReservation | null) {
    setConfirmError(false);
    start(async () => {
      const res = await confirmVenueReservation(token).catch(() => ({ ok: false as const, error: "network" }));
      if (res.ok) {
        setState({ kind: "done", reservation: res.data ?? current, already: false });
        requestAnimationFrame(() => doneRef.current?.focus());
      } else if (res.error === "invalid_link") {
        setState({ kind: "invalid" });
      } else {
        setConfirmError(true);
      }
    });
  }

  if (state.kind === "loading") return <Skeleton lines={5} title label={copy.loading} />;
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
      </div>
    );
  }
  if (state.kind === "error") {
    return (
      <div className="stack">
        <PageHeader title={copy.title} />
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
    const r = state.reservation;
    const cancelled = r?.status && r.status !== "reserved";
    return (
      <div className="stack stack-lg">
        <header className="page-header">
          <h1 className="page-header__title" ref={doneRef} tabIndex={-1}>
            {cancelled ? copy.cancelledTitle : state.already ? copy.alreadyTitle : copy.doneTitle}
          </h1>
        </header>
        <Notice tone={cancelled ? "warning" : "success"} live="polite">
          {cancelled
            ? copy.cancelledText
            : state.already && r?.venue_confirmed_at
              ? copy.alreadyText(formatReceipt(r.venue_confirmed_at))
              : copy.doneText}
        </Notice>
        {r ? (
          <Card>
            <Details r={r} />
          </Card>
        ) : null}
      </div>
    );
  }

  const r = state.reservation;
  const cancelled = r?.status && r.status !== "reserved";
  return (
    <div className="stack stack-lg">
      <PageHeader title={cancelled ? copy.cancelledTitle : copy.title} lead={cancelled ? copy.cancelledText : copy.lead} />
      <Card>
        {r ? <Details r={r} /> : <p className="soft">{copy.detailsInMail}</p>}
        {r?.reservation_name ? <p className="soft">{copy.guests(r.reservation_name)}</p> : null}
      </Card>
      {confirmError ? (
        <Notice tone="danger" live="assertive">
          {copy.errorText}
        </Notice>
      ) : null}
      {!cancelled ? (
        <div>
          <Button icon="check" loading={pending} onClick={() => confirm(state.token, r)}>
            {pending ? copy.confirming : copy.confirm}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
