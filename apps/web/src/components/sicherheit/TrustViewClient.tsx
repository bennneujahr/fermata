"use client";
// Öffentliche Seite „Abend teilen“ (/teilen#t=…): liest den Schlüssel aus dem Fragment und lädt die Ansicht
// über eine Server Action (trust-view, JSON). Zeigt Lokal, Zeit, Vorname, Heimwegtelefon und 110 – nie das Gegenüber.
import { useCallback, useEffect, useState } from "react";
import { loadTrustView } from "@/app/actions/safety";
import { Button, Card, EmptyState, Notice, PageHeader, Skeleton } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { trustView as copy } from "@/copy/sicherheit";
import { formatDayTime } from "@/lib/datetime";
import { formatDateTime } from "@/lib/format";
import { digitsForTel, tokenFromLocation } from "@/lib/safety-rules";
import type { TrustView } from "@/lib/safety-types";
import "./sicherheit.css";

type State = { kind: "loading" } | { kind: "missing" } | { kind: "invalid" } | { kind: "error" } | { kind: "ok"; view: TrustView };

export function TrustViewClient() {
  const [state, setState] = useState<State>({ kind: "loading" });

  const load = useCallback(async () => {
    const token = tokenFromLocation(window.location.hash, window.location.search);
    if (!token) {
      setState({ kind: "missing" });
      return;
    }
    setState({ kind: "loading" });
    const res = await loadTrustView(token).catch(() => ({ ok: false as const, error: "network" }));
    if (!res.ok) setState({ kind: "error" });
    else if (!res.data) setState({ kind: "invalid" });
    else setState({ kind: "ok", view: res.data });
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- der Schlüssel steht nur im Browser (Fragment)
    void load();
    const onHash = () => void load();
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [load]);

  if (state.kind === "loading") return <Skeleton lines={4} title label={copy.loading} />;
  if (state.kind === "missing") {
    return (
      <EmptyState title={copy.missingTitle} headingLevel={2}>
        <p>{copy.missingText}</p>
      </EmptyState>
    );
  }
  if (state.kind === "invalid" || state.kind === "error") {
    return (
      <div className="stack">
        <PageHeader title={copy.invalidTitle} />
        <Notice tone={state.kind === "error" ? "warning" : "info"}>{state.kind === "error" ? copy.errorText : copy.invalidText}</Notice>
        {state.kind === "error" ? (
          <div>
            <Button variant="secondary" onClick={() => void load()}>
              {copy.retry}
            </Button>
          </div>
        ) : null}
        <a href="tel:110" className="call call--emergency">
          <span className="call__icon">
            <Icon name="phone" />
          </span>
          <span className="call__text">{copy.police("110")}</span>
        </a>
      </div>
    );
  }

  const v = state.view;
  const name = v.first_name;
  const emergency = v.emergency_number || "110";
  return (
    <div className="stack stack-lg">
      <PageHeader title={copy.title(name)} lead={copy.lead(name)} />
      <div className="grid-auto">
        <Card title={copy.when} id="wann" headingLevel={2}>
          <p className="public-when">{formatDayTime(v.starts_at)}</p>
        </Card>
        <Card title={copy.where} id="wo" headingLevel={2}>
          {v.venue ? (
            <address className="public-address">
              <strong>{v.venue.name}</strong>
              {v.venue.street ? <span>{v.venue.street}</span> : null}
              {v.venue.postal_code || v.venue.city ? <span>{[v.venue.postal_code, v.venue.city].filter(Boolean).join(" ")}</span> : null}
              {v.venue.public_transport ? <span className="soft text-sm">{copy.transport(v.venue.public_transport)}</span> : null}
            </address>
          ) : (
            <p className="soft">{copy.venueOpen}</p>
          )}
        </Card>
      </div>
      <Card title={copy.worryTitle} id="sorgen" variant="outline" headingLevel={2}>
        <p className="soft">{copy.worryText(name)}</p>
        {v.heimwegtelefon?.number ? (
          <div className="stack stack-sm">
            <h3>{copy.heimweg}</h3>
            <p className="soft text-sm">{copy.heimwegText}</p>
            <a href={`tel:${v.heimwegtelefon.tel || digitsForTel(v.heimwegtelefon.number)}`} className="call">
              <span className="call__icon">
                <Icon name="phone" />
              </span>
              <span className="call__text">
                <span>{copy.call(v.heimwegtelefon.number)}</span>
                {v.heimwegtelefon.hours ? <span className="call__sub">{copy.hours(v.heimwegtelefon.hours)}</span> : null}
              </span>
            </a>
          </div>
        ) : null}
        <a href={`tel:${digitsForTel(emergency)}`} className="call call--emergency">
          <span className="call__icon">
            <Icon name="phone" />
          </span>
          <span className="call__text">{copy.police(emergency)}</span>
        </a>
      </Card>
      <div className="stack stack-sm">
        <p className="soft">{copy.expires(formatDateTime(v.expires_at))}</p>
        <p className="muted text-sm">{copy.privacy}</p>
      </div>
      <Card title={copy.about} variant="sunk" headingLevel={2} id="fermata">
        <p className="soft">{copy.aboutText}</p>
      </Card>
    </div>
  );
}
